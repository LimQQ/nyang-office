import * as O from './office.js';
import { createOffice, lightOf } from './sim.js';
import { startDemo } from './demo.js';

const TILE = O.TILE;
const DEMO = new URLSearchParams(location.search).has('demo');
const HOUR = new URLSearchParams(location.search).get('hour'); // ?hour=22 처럼 시간을 정해 볼 수 있다
const $ = s => document.querySelector(s);

const canvas = $('#world');
const g = canvas.getContext('2d');
canvas.width = O.PW;
canvas.height = O.PH;
const stage = $('#stage');
const wrap = $('#world-wrap');
const overlay = $('#overlay');
const bg = document.createElement('canvas');
bg.width = O.PW;
bg.height = O.PH;
O.paintBackground(bg.getContext('2d'));
let scale = 2;

// ───────────────────────── 사무실 ─────────────────────────

const STATS_KEY = 'nyang-office:stats';
function loadStats() { try { return JSON.parse(localStorage.getItem(STATS_KEY)); } catch { return null; } }
function saveStats(s) { try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch {} renderChamp(); }

const office = createOffice({
  log: (c, text, kind) => log(c, text, kind),
  todos: items => setTodos(items),
  stats: loadStats(),
  saveStats,
  hour: HOUR != null ? () => Number(HOUR) : undefined,
});
const { handle, reset: resetOffice } = office;
const reset = snap => {
  logList.innerHTML = '';
  const f = floorOf(current);
  resetOffice(snap, f ? f.floor + 'F ' + f.name : '');
};

// 고양이마다 머리 위 말풍선 · 이름표 DOM
const uiEls = new Map();
function uiEl(c) {
  let u = uiEls.get(c);
  if (u) return u;
  const el = document.createElement('div');
  el.className = 'cat-ui';
  el.innerHTML = '<div class="bubble hidden"></div><div class="tag"></div>';
  el.lastChild.textContent = c.name;
  el.lastChild.style.setProperty('--dot', c.look.dot);
  overlay.appendChild(el);
  u = { el, bubbleEl: el.firstChild, key: null };
  uiEls.set(c, u);
  return u;
}

function placeUi(c) {
  const u = uiEl(c);
  const s = office.uiOf(c);
  u.el.style.transform = `translate(${s.x * scale}px, ${s.y * scale}px)`;
  u.el.style.opacity = s.alpha;
  u.el.classList.toggle('crowd', s.crowd);
  const b = s.bubble;
  const key = b ? b.kind + '|' + b.text : '';
  if (key === u.key) return;
  u.key = key;
  u.bubbleEl.className = 'bubble ' + (b ? b.kind : 'hidden');
  u.bubbleEl.textContent = b ? b.text : '';
}

function render() {
  g.drawImage(bg, 0, 0);
  office.draw(g);
  const cats = office.cats();
  for (const c of cats) placeUi(c);
  for (const [c, u] of uiEls) if (c.gone || !cats.includes(c)) { u.el.remove(); uiEls.delete(c); }
  renderSky();
}

let last = performance.now();
function frame() {
  requestAnimationFrame(frame);
  const tn = performance.now();
  // 창이 가려지면 브라우저가 프레임을 줄이거나 멈춘다. 돌아왔을 때 한꺼번에 몰아 진행하지 않도록 0.5초로 자른다.
  office.step(Math.min(0.5, (tn - last) / 1000));
  last = tn;
  render();
}

// 고양이를 누르면 쓰다듬는다
canvas.addEventListener('click', e => {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * O.PW, y = (e.clientY - r.top) / r.height * O.PH;
  let best = null, bestD = 14;
  for (const c of office.cats()) {
    const d = Math.hypot(c.x + 8 - x, c.y + 9 - y);
    if (d < bestD) { best = c; bestD = d; }
  }
  if (best) office.pet(best.id);
});
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * O.PW, y = (e.clientY - r.top) / r.height * O.PH;
  canvas.style.cursor = office.cats().some(c => Math.hypot(c.x + 8 - x, c.y + 9 - y) < 14) ? 'pointer' : '';
});

// 오늘의 사원 · 하늘
function renderChamp() {
  const el = $('#champ');
  if (!el) return;
  const c = office && office.champion();
  const s = office && office.stats;
  el.textContent = c ? `🏆 오늘의 사원 · ${c.name} (${c.count}건)` : '🏆 오늘의 사원 · 아직 없음';
  el.title = s ? `오늘 쓰다듬은 횟수 ${s.pets}번 · 츄르 택배 ${s.churus}번 · 다음 츄르까지 ${Math.max(0, 12 - s.sinceChuru)}건` : '';
}
let lastSky = '';
function renderSky() {
  const d = new Date();
  const h = HOUR != null ? Number(HOUR) : d.getHours() + d.getMinutes() / 60;
  const name = lightOf(h).name;
  if (name === lastSky) return;
  lastSky = name;
  const el = $('#sky');
  if (el) el.textContent = { 낮: '☀️ 낮', 노을: '🌇 노을', 저녁: '🌆 저녁', 아침: '🌅 아침', 새벽: '🌌 새벽', 밤: '🌙 밤' }[name] || name;
}

// ───────────────────────── 화면 위 글자들 ─────────────────────────

function at(el, x, y) {
  el.style.left = `calc(var(--s) * ${x}px)`;
  el.style.top = `calc(var(--s) * ${y}px)`;
  overlay.appendChild(el);
  return el;
}

for (const [id, r] of Object.entries(O.ROOMS)) {
  if (!r.emoji) continue;
  const el = document.createElement('div');
  el.className = 'room-label';
  el.textContent = `${r.emoji} ${r.name}`;
  at(el, r.x0 * TILE + 2, (r.y1 + 1) * TILE - 11);
}
const liftDisplay = at(Object.assign(document.createElement('div'), { className: 'lift-display' }), 10 * TILE + 6, 8 * TILE - 9);
at(Object.assign(document.createElement('div'), { className: 'ev-sign', textContent: 'EV' }), 9 * TILE + 18, 40);
const board = at(Object.assign(document.createElement('ol'), { className: 'board' }), O.WHITEBOARD.x * TILE + 3, O.WHITEBOARD.y * TILE - 12);

function setTodos(items) {
  board.innerHTML = '';
  const first = Math.max(0, items.findIndex(x => x.s !== 'completed'));
  for (const it of items.slice(Math.max(0, first - 1), Math.max(0, first - 1) + 4)) {
    const li = document.createElement('li');
    li.className = it.s;
    li.textContent = it.t;
    board.appendChild(li);
  }
}

const logList = $('#log-list');
function log(c, text, kind = '') {
  const li = document.createElement('li');
  li.className = kind;
  li.innerHTML = '<time></time><b></b><span></span>';
  li.querySelector('time').textContent = new Date().toTimeString().slice(0, 8);
  const who = li.querySelector('b');
  who.textContent = c.name;
  who.style.setProperty('--dot', c.look.dot);
  li.querySelector('span').textContent = text;
  logList.prepend(li);
  while (logList.children.length > 60) logList.lastChild.remove();
}

function fit() {
  const r = stage.getBoundingClientRect();
  const fitScale = Math.min((r.width - 16) / O.PW, (r.height - 16) / O.PH);
  // 0.5 배 단위로만 키워야 도트가 고르게 보인다
  scale = fitScale >= 1 ? Math.floor(fitScale * 2) / 2 : Math.max(0.5, fitScale);
  wrap.style.width = O.PW * scale + 'px';
  wrap.style.height = O.PH * scale + 'px';
  document.documentElement.style.setProperty('--s', scale);
}
new ResizeObserver(fit).observe(stage);
fit();

// ───────────────────────── 층별 안내 · 세션 따라가기 ─────────────────────────

let floors = [];
let current = null;
let es = null;
let demo = null;
const pin = { floor: null, session: null };

// 세션 키는 '기록 폴더/세션 id'. 층은 작업 단위라 폴더와 다를 수 있어서, 세션이 들어 있는 층을 직접 찾는다.
const sessionKey = s => s.proj + '/' + s.id;
const floorOf = key => key && floors.find(f => f.sessions.some(s => sessionKey(s) === key));
const sessionOf = key => { const f = floorOf(key); return f && f.sessions.find(s => sessionKey(s) === key); };

function ago(ms) {
  const s = ms / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return Math.floor(s / 60) + '분 전';
  if (s < 86400) return Math.floor(s / 3600) + '시간 전';
  return Math.floor(s / 86400) + '일 전';
}

function renderFloors() {
  const el = $('#floors');
  const tNow = Date.now();
  const here = floorOf(current);
  el.innerHTML = '';
  for (const f of [...floors].reverse()) {
    const li = document.createElement('li');
    const age = tNow - f.mtime;
    li.className = 'floor' + (f === here ? ' here' : '') + (age < 2 * 60 * 1000 ? ' live' : '') + (age > 7 * 864e5 ? ' dark' : '');
    li.innerHTML = '<button class="fl"><span class="no"></span><span class="nm"><b></b><small></small></span><span class="lamp"></span></button>';
    li.querySelector('.no').textContent = f.floor + 'F';
    li.querySelector('.nm b').textContent = f.name;
    li.querySelector('.nm small').textContent = f.dir && f.dir !== f.name ? '📁 ' + f.dir : '';
    li.querySelector('.fl').title = f.name + '\n' + (f.cwd || f.key);
    li.querySelector('.fl').onclick = () => { pin.floor = f.key; pin.session = null; maybeSwitch(true); renderFloors(); };
    if (f === here) {
      const ol = document.createElement('ol');
      ol.className = 'shops';
      for (const s of f.sessions) {
        const key = sessionKey(s);
        const sl = document.createElement('li');
        sl.innerHTML = '<button><span class="t"></span><span class="ago"></span></button>';
        if (key === current) sl.className = 'on';
        sl.querySelector('.t').textContent = s.title || s.id.slice(0, 8);
        sl.querySelector('.ago').textContent = ago(tNow - s.mtime);
        sl.querySelector('button').onclick = () => { pin.floor = f.key; pin.session = key; switchTo(key); };
        ol.appendChild(sl);
      }
      li.appendChild(ol);
    }
    el.appendChild(li);
  }
  $('#follow').classList.toggle('on', !pin.floor && !pin.session);
  $('#follow').textContent = pin.session ? '📌 이 매장 고정 중 — 자동으로' : pin.floor ? '🏢 이 층 따라가는 중 — 자동으로' : '✨ 최근 세션 자동 따라가기';
}

function renderHeader() {
  const f = floorOf(current);
  const s = sessionOf(current);
  $('#lift-floor').textContent = f ? f.floor + 'F' : '--';
  $('#floor-name').textContent = f ? f.name : '빈 건물';
  const shop = s ? s.title || s.id.slice(0, 8) : '';
  $('#session-title').textContent = f ? ['📁 ' + (f.dir || f.key), shop !== f.name && shop].filter(Boolean).join(' · ') : '';
  liftDisplay.textContent = f ? f.floor + 'F' : '';
}

function desiredSession() {
  if (pin.session) return pin.session;
  let best = null;
  for (const f of floors) {
    if (pin.floor && f.key !== pin.floor) continue;
    for (const s of f.sessions) if (!best || s.mtime > best.mtime) best = { key: sessionKey(s), mtime: s.mtime };
  }
  return best && best.key;
}

// 두 세션이 번갈아 움직일 때 화면이 널뛰지 않도록, 지금 세션이 20초 넘게 조용할 때만 갈아탄다.
function maybeSwitch(force) {
  const want = desiredSession();
  if (!want || want === current) return;
  if (!force && current && !pin.session) {
    const s = sessionOf(current);
    const sameScope = !pin.floor || (floorOf(current) || {}).key === pin.floor;
    if (s && sameScope && Date.now() - s.mtime < 20 * 1000) return;
  }
  switchTo(want);
}

function switchTo(key) {
  const before = floorOf(current), next = floorOf(key);
  current = key;
  if (before && next && before !== next) ride(before.floor, next.floor);
  renderHeader();
  renderFloors();
  renderChamp();
  if (DEMO) { if (demo && before) demo.restart(); return; }
  if (es) es.close();
  es = new EventSource('/events?s=' + encodeURIComponent(key));
  es.addEventListener('index', e => { floors = JSON.parse(e.data); renderFloors(); renderHeader(); maybeSwitch(false); });
  es.addEventListener('snapshot', e => reset(JSON.parse(e.data)));
  es.addEventListener('ev', e => handle(JSON.parse(e.data)));
  es.onopen = () => setConn(true);
  es.onerror = () => setConn(false);
}

function ride(from, to) {
  $('#lift-arrow').textContent = to > from ? '▲' : '▼';
  for (const el of [$('#lift'), wrap]) { el.classList.remove('ride'); void el.offsetWidth; el.classList.add('ride'); }
  
}

function setConn(ok) {
  const el = $('#conn');
  el.className = ok ? 'live' : 'off';
  el.textContent = ok ? '● 실시간' : '● 연결 끊김 · 다시 붙는 중';
}

function notice(html) {
  const el = $('#notice');
  el.innerHTML = html;
  el.hidden = !html;
}

$('#follow').onclick = () => { pin.floor = null; pin.session = null; maybeSwitch(true); renderFloors(); };

async function boot() {
  requestAnimationFrame(frame);
  renderChamp();
  if (DEMO) {
    $('#conn').className = 'demo';
    $('#conn').textContent = '● 데모';
    const api = {
      setFloors(list, key) { floors = list; if (!current) switchTo(key); else { renderFloors(); renderHeader(); } },
      reset, handle,
    };
    // ?demo&manual 이면 각본 없이 콘솔에서 office.handle({...}) 로 직접 이벤트를 넣어 볼 수 있다
    window.office = {
      ...api,
      advance(sec) { for (let i = 0; i < sec * 30; i++) office.step(1 / 30); render(); }, // 시간 빨리 감기
      cats: () => office.cats().map(c => ({ id: c.id, x: c.x, y: c.y, path: c.path.length, phase: c.phase, state: c.state, pose: c.pose, label: c.label, jobs: c.jobs ? c.jobs.size : undefined })),
      letters: () => office.letters(),
      pet: id => office.pet(id),
      surprise: kind => office.surpriseNow(kind), // 'box' 'bird' 'laser' 'churu'
      get state() { return { surprise: office.surprise, meeting: office.meeting, stats: office.stats, champion: office.champion() }; },
    };
    if (new URLSearchParams(location.search).has('manual')) {
      api.setFloors([{ key: 'demo', name: 'manual', floor: 1, mtime: Date.now(), sessions: [{ id: 'x', proj: 'demo', title: '수동 테스트', mtime: Date.now() }] }], 'demo/x');
      reset({ main: { quietMs: 0 } });
    } else demo = startDemo(api);
    return;
  }
  try {
    floors = await (await fetch('/api/index')).json();
  } catch {
    setConn(false);
    notice('서버에 연결하지 못했어요. 터미널에서 <code>node server.js</code> 로 켠 뒤 새로고침하거나, <a href="?demo">데모</a>를 먼저 구경해 보세요.');
    reset({ main: { quietMs: 1e9 } });
    return;
  }
  if (!floors.length) {
    notice('아직 Claude Code 세션 기록이 없어요. Claude Code를 한 번 쓰고 나면 사무실이 열립니다. <a href="?demo">데모 보기</a>');
    reset({ main: { quietMs: 1e9 } });
    return;
  }
  maybeSwitch(true);
}
boot();
