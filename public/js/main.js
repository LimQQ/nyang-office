import * as O from './office.js';
import * as S from './sprites.js';
import { chooseIdleActivity } from './idle.js';
import { startDemo } from './demo.js';

const TILE = O.TILE;
const SPEED = 64;                  // 가까운 곳은 이 속도로 걷는다 (원본 해상도 px/초)
const TRIP_SEC = 1.6;              // 먼 곳도 이 안에 도착하도록 뛴다 — 도구는 몇 초 간격으로 바뀌니까
const IDLE_AFTER = 12 * 1000;      // 아무 소식이 이만큼 없으면 Claude 가 쉬러 간다
const STUCK_AFTER = 5 * 60 * 1000; // 결과가 영영 안 오는 일은 이만큼 지나면 잊는다
const MIN_WORK = 900;              // 담당 고양이는 일을 받으면 적어도 이만큼은 일하는 모습을 보인다
const REST_AFTER = 1500;           // 일이 끝나고 이만큼 지나면 고개를 돌려 앞을 본다
const DOZE_AFTER = 60 * 1000;      // 이만큼 한가하면 자리로 돌아가 존다
const ROAM_SPEED = 26;             // 쉬는 고양이는 느긋하게 걷는다
const MEET_LEN = 7000;             // 회의 길이
const MEET_COOLDOWN = 40 * 1000;   // 회의가 너무 자주 열리지 않도록(긴급 회의는 예외)
const TEA_EVERY = [90 * 1000, 150 * 1000]; // 한가할 때 가끔 티타임
const DEMO = new URLSearchParams(location.search).has('demo');
const $ = s => document.querySelector(s);
// 모든 예약·말풍선·걷기는 이 시뮬레이션 시계를 따른다. 탭이 가려져 프레임이 멈추면 사무실 시간도 같이 멈춘다.
let simMs = 0;
const now = () => simMs;
const pick = a => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);

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

// ───────────────────────── 도구 → 담당 방 ─────────────────────────

export function roomForTool(name = '') {
  if (/^(TodoWrite|TaskCreate|TaskUpdate|TaskList|TaskGet|EnterPlanMode)$/.test(name) || /update_plan$/.test(name)) return 'meeting';
  if (/^(AskUserQuestion|ExitPlanMode)$/.test(name) || /wrap_up$/.test(name)) return 'boss';
  if (/^(Agent|Task|SendMessage)$/.test(name)) return 'home';
  if (/^(Read|Glob|Grep|LS|NotebookRead|Skill|ToolSearch)$/.test(name)) return 'library';
  if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(name)) return 'dev';
  if (/^(Bash|PowerShell|BashOutput|KillShell|KillBash|Monitor|TaskOutput|TaskStop)$/.test(name)) return 'server';
  if (/^(WebFetch|WebSearch)$/.test(name) || name.startsWith('mcp__')) return 'web';
  return 'dev';
}
const POSE = { library: 'read', dev: 'type', server: 'rack', web: 'type', meeting: 'write', home: 'sit', nap: 'sleep', seat: 'sit', meet: 'sit' };
// 담당 고양이가 일을 받을 때 하는 대답
const ACK = {
  library: ['찾아볼게냥', '넵! 📚', '서가 뒤지는 중'],
  dev: ['고쳐볼게냥', '넵! ⌨️', '코딩 들어간다'],
  server: ['돌려볼게냥', '넵! 🖥️', '실행!'],
  web: ['검색해올게냥', '넵! 🌐', '다녀올게'],
  meeting: ['적어둘게냥', '넵! 🗒️', '정리 중'],
};

// ───────────────────────── 자리 예약 ─────────────────────────

const claims = new Map(); // '자리:번호' → 고양이

function takeSpot(kind, cat) {
  release(cat);
  const list = O.SPOTS[kind] || [];
  for (let i = 0; i < list.length; i++) {
    const key = kind + ':' + i;
    if (claims.has(key)) continue;
    claims.set(key, cat);
    cat.claim = key;
    const [x, y, face, oy] = list[i];
    return { x, y, face, oy, pose: POSE[kind] };
  }
  // 자리가 다 찼으면 복도 빈 바닥에 서 있는다
  const r = O.ROOMS.hall;
  for (let k = 0; k < 80; k++) {
    const x = r.x0 + Math.floor(Math.random() * (r.x1 - r.x0 + 1));
    const y = r.y0 + Math.floor(Math.random() * (r.y1 - r.y0 + 1));
    if (O.walkable(x, y) && !occupied(x, y, cat)) return { x, y, face: 'down', oy: 0, pose: 'stand' };
  }
  return { x: r.x0, y: r.y0, face: 'down', oy: 0, pose: 'stand' };
}

function release(cat) {
  if (cat.claim && claims.get(cat.claim) === cat) claims.delete(cat.claim);
  cat.claim = null;
}

function occupied(x, y, except) {
  return everyone().some(c => c !== except && c.target && Math.floor(c.target.x) === x && Math.floor(c.target.y) === y);
}

// ───────────────────────── 예약 실행 ─────────────────────────

let timers = [];
const after = (ms, fn) => timers.push({ at: now() + ms, fn });
function runTimers() {
  const t = now();
  const due = timers.filter(x => x.at <= t);
  timers = timers.filter(x => x.at > t);
  due.forEach(x => x.fn());
}

// ───────────────────────── 고양이 ─────────────────────────

class Cat {
  constructor(id, look, name, human = false) {
    this.id = id; this.look = look; this.name = name; this.human = human;
    this.x = 15 * TILE; this.y = 4 * TILE; this.oy = 0;
    this.path = []; this.face = 'down'; this.pose = 'sit'; this.target = null; this.then = null;
    this.room = null; this.claim = null; this.phase = 'work';
    this.alpha = 1; this.fade = 0;
    this.lastAt = now();
    this.sweatUntil = 0; this.chinUntil = 0; this.phoneUntil = 0;
    this.nextBlink = now() + 2000 + Math.random() * 3000;
    this.label = ''; this.bubble = null; this.bubbleKey = null;
    this.el = document.createElement('div');
    this.el.className = 'cat-ui';
    this.el.innerHTML = '<div class="bubble hidden"></div><div class="tag"></div>';
    this.bubbleEl = this.el.firstChild;
    this.tagEl = this.el.lastChild;
    this.tagEl.textContent = name;
    this.tagEl.style.setProperty('--dot', look.dot);
    overlay.appendChild(this.el);
  }

  place(spot) {
    this.target = spot;
    this.x = spot.x * TILE;
    this.y = spot.y * TILE;
    this.path = [];
    this.arrive();
  }

  goTo(spot, then, { slow = false } = {}) {
    this.target = spot;
    this.then = then || null;
    const sx = Math.round(this.x / TILE), sy = Math.round(this.y / TILE);
    this.path = O.findPath(sx, sy, Math.floor(spot.x), Math.floor(spot.y)).map(([x, y]) => [x * TILE, y * TILE]);
    this.path.push([spot.x * TILE, spot.y * TILE]); // 반 칸 자리 보정
    this.oy = 0;
    let len = 0, px = this.x, py = this.y;
    for (const [x, y] of this.path) { len += Math.hypot(x - px, y - py); px = x; py = y; }
    this.speed = slow ? ROAM_SPEED : Math.max(SPEED, len / TRIP_SEC);
  }

  arrive() {
    const s = this.target;
    if (s) { this.face = s.face; this.pose = s.pose || 'stand'; this.oy = s.oy || 0; }
    const fn = this.then;
    this.then = null;
    if (fn) fn();
  }

  update(dt) {
    let budget = (this.speed || SPEED) * dt; // 한 프레임이 길어도 그만큼 여러 칸을 간다
    while (budget > 0 && this.path.length) {
      const [tx, ty] = this.path[0];
      const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
      if (d > 0.5) this.face = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      if (d <= budget) {
        this.x = tx; this.y = ty;
        budget -= d;
        this.path.shift();
        if (!this.path.length) this.arrive();
      } else {
        this.x += (dx / d) * budget;
        this.y += (dy / d) * budget;
        budget = 0;
      }
    }
    if (this.fade) {
      this.alpha = Math.min(1, Math.max(0, this.alpha + this.fade * dt * 2.5));
      if (this.alpha === 0 || this.alpha === 1) this.fade = 0;
    }
  }

  say(kind, text, ms = 4000) { this.bubble = { kind, text, until: now() + ms }; }

  remove() { release(this); this.el.remove(); }
}

// 방마다 한 마리씩 상주하는 담당 고양이. 자리를 뜨지 않고 편지로 일을 받는다.
const residents = {};
for (const [room, [x, y, face, oy]] of Object.entries(O.DESKS)) {
  const r = new Cat('r-' + room, S.RESIDENT_LOOKS[room], S.RESIDENT_LOOKS[room].name);
  r.homeRoom = room;
  r.desk = { x, y, face, oy, pose: POSE[room] };
  r.jobs = new Set();
  residents[room] = r;
}
const residentList = Object.values(residents);
residentList.forEach(r => residentReset(r));

const human = new Cat('human', S.LOOKS.human, '집사 (나)', true);
human.place({ x: O.HUMAN_AT[0], y: O.HUMAN_AT[1], face: 'down', pose: 'sit' });
human.jobs = new Set();

let claude = null;
const agents = new Map();
const requesters = () => (claude ? [claude, ...agents.values()] : [...agents.values()]);
const everyone = () => [...requesters(), ...residentList];
const catOf = a => (a === 'main' ? claude : agents.get(a));

function sendTo(c, kind, then) {
  if (c.room === kind) {
    if (c.path.length) { if (then) c.then = then; } else if (then) then();
    return;
  }
  c.room = kind;
  c.goTo(takeSpot(kind, c), then);
}

function faceTo(x, y, other) {
  const dx = other.x / TILE - x, dy = other.y / TILE - y;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
}

function wake(c) {
  if (c.phase !== 'idle') return;
  if (c.pose === 'sleep') c.say('speech', '냐…? 💤', 1200);
  c.phase = 'work';
  c.idleAct = null;
}

// ───────────────────────── 담당 고양이 상태 ─────────────────────────

// state: work 일하는 중 · ready 자리에서 쉼 · roam 돌아다님 · homing 자리로 돌아가는 중
//        going 일하러 뛰어가는 중 · meeting 회의 중 · doze 자리에서 졺
const CHAT = ['냥?', '오늘 뭐 해냥', '츄르 먹을래?', '간식 있어?', '고생했어냥', '창밖에 새 봤어?'];
const REPLY = ['냥!', '좋아냥!', '나중에~', '😺', '냐옹', '나도 봤어!'];
const YAWN = ['하암~', '기지개 쭈욱~', '졸리다냥', '🐟 생각 중'];

const atDesk = r => !r.path.length && Math.abs(r.x - r.desk.x * TILE) < 1 && Math.abs(r.y - r.desk.y * TILE) < 1;

function residentWork(r, label) {
  if (r.state === 'doze') r.say('speech', '냐…? 💤 넵!', 1200);
  r.state = 'work';
  r.label = label;
  r.face = r.desk.face;
  r.pose = r.desk.pose;
}

function residentReset(r) {
  r.jobs.clear();
  release(r);
  r.place(r.desk);
  r.state = 'ready';
  r.restAt = now();
  r.nextIdleAt = now() + rand(4000, 10000);
  r.label = '';
  r.bubble = null;
  r.face = 'down';
  r.pose = 'sit';
}

const settle = r => () => { r.state = 'ready'; r.face = 'down'; r.pose = 'sit'; r.nextIdleAt = now() + rand(4000, 9000); };

function goDesk(r, then, slow = false) {
  release(r);
  r.goTo(r.desk, then, { slow });
}

function randomTile(room, cat) {
  for (let k = 0; k < 40; k++) {
    const x = room.x0 + Math.floor(Math.random() * (room.x1 - room.x0 + 1));
    const y = room.y0 + Math.floor(Math.random() * (room.y1 - room.y0 + 1));
    if (O.walkable(x, y) && !occupied(x, y, cat)) return [x, y];
  }
  return null;
}

function roamTo(r, tile) {
  if (!tile) return;
  release(r);
  r.state = 'roam';
  r.goTo({ x: tile[0], y: tile[1], face: 'down', pose: 'stand' }, null, { slow: true });
}

// 한가한 친구 옆으로 가서 수다 한 마디
function visitFriend(r) {
  const friends = residentList.filter(o => o !== r && !o.jobs.size && (o.state === 'ready' || o.state === 'roam') && !o.path.length);
  if (!friends.length) return roamTo(r, randomTile(O.ROOMS.hall, r));
  const f = pick(friends);
  const [x, y] = O.nearestFree(Math.round(f.x / TILE), Math.round(f.y / TILE), (x, y) => !occupied(x, y, r));
  release(r);
  r.state = 'roam';
  r.goTo({ x, y, face: faceTo(x, y, f), pose: 'stand' }, () => {
    if (r.jobs.size || r.state !== 'roam') return;
    r.say('speech', pick(CHAT), 1600);
    after(900, () => {
      if (f.jobs.size || f.state === 'doze' || f.state === 'meeting' || f.path.length) return;
      f.face = faceTo(f.x / TILE, f.y / TILE, r);
      f.say('speech', pick(REPLY), 1500);
    });
  }, { slow: true });
}

function idleAction(r) {
  r.nextIdleAt = now() + rand(5000, 11000);
  const roll = Math.random();
  if (roll < 0.3) roamTo(r, randomTile(O.ROOMS[r.homeRoom], r));
  else if (roll < 0.45) roamTo(r, randomTile(O.ROOMS.hall, r));
  else if (roll < 0.6) visitFriend(r);
  else if (roll < 0.72) { r.pose = 'groom'; r.face = 'down'; }
  else if (roll < 0.82) r.say('speech', pick(YAWN), 1400);
  else { r.state = 'homing'; goDesk(r, settle(r), true); }
}

// 일이 없으면 앞을 보고 쉬다가 돌아다니고, 오래 한가하면 자리로 돌아가 존다
function tickResidents() {
  const t = now();
  for (const r of residentList) {
    if (r.jobs.size || r.state === 'going' || r.state === 'meeting') continue;
    if (r.state === 'work') {
      if (t - r.restAt > REST_AFTER) { settle(r)(); r.label = ''; r.nextIdleAt = t + rand(3000, 8000); }
      continue;
    }
    if (r.path.length || r.state === 'doze') continue;
    if (t - r.restAt > DOZE_AFTER) {
      if (atDesk(r)) { r.state = 'doze'; r.pose = 'sleep'; r.face = 'down'; }
      else if (r.state !== 'homing') { r.state = 'homing'; goDesk(r, settle(r), true); }
      continue;
    }
    if (t >= r.nextIdleAt) idleAction(r);
  }
}

// 서브에이전트는 자리에서 가끔 두리번거린다
function tickAgents() {
  const t = now();
  for (const c of agents.values()) {
    if (c.phase !== 'work' || c.path.length || !c.target || t < (c.nextLook || 0)) continue;
    c.nextLook = t + rand(3000, 7000);
    c.face = c.face === c.target.face ? pick(['down', 'left', 'right']) : c.target.face;
  }
}

// ───────────────────────── 편지 ─────────────────────────

const letters = [];

const headOf = c => [c.x + 8, c.y + (c.path.length ? 0 : c.oy) + 3];

// 받는 고양이가 걷고 있어도 편지가 따라간다(도착 지점은 매 프레임 다시 계산)
function sendLetter(from, to, err, onLand) {
  const a = headOf(from), b = headOf(to);
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
  letters.push({ a, to, dist, t0: now(), dur: Math.min(1300, Math.max(600, dist * 4.5)), err, onLand });
}

function tickLetters() {
  for (let i = letters.length - 1; i >= 0; i--) {
    const l = letters[i];
    if (now() - l.t0 < l.dur) continue;
    letters.splice(i, 1);
    if (l.onLand) l.onLand();
  }
}

function drawLetters() {
  for (const l of letters) {
    const p = Math.min(1, (now() - l.t0) / l.dur);
    const b = headOf(l.to);
    const at = q => {
      const e = q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2;
      const arc = Math.min(44, l.dist * 0.35) * 4 * e * (1 - e);
      return [l.a[0] + (b[0] - l.a[0]) * e, l.a[1] + (b[1] - l.a[1]) * e - arc];
    };
    for (const k of [0.12, 0.06]) { // 꼬리 점선
      if (p - k <= 0) continue;
      const [tx, ty] = at(p - k);
      g.fillStyle = l.err ? 'rgba(208,80,74,.6)' : 'rgba(255,255,255,.75)';
      g.fillRect(Math.round(tx), Math.round(ty), 1, 1);
    }
    const [x, y] = at(p);
    const X = Math.round(x) - 4, Y = Math.round(y) - 3;
    const ink = l.err ? '#a8322c' : '#3a2a22';
    g.fillStyle = ink; g.fillRect(X, Y, 9, 7);
    g.fillStyle = l.err ? '#ffd6d1' : '#fffdf5'; g.fillRect(X + 1, Y + 1, 7, 5);
    g.fillStyle = ink;
    for (const [dx, dy] of [[1, 1], [2, 2], [3, 3], [4, 3], [5, 3], [6, 2], [7, 1]]) g.fillRect(X + dx, Y + dy, 1, 1);
    if (!l.err) { g.fillStyle = '#d0504a'; g.fillRect(X + 4, Y + 4, 1, 1); }
  }
}

// ───────────────────────── 일 맡기기 ─────────────────────────

const jobs = new Map(); // tool_use id → { id, from, worker, room, label, landed, startedAt, result, done, createdAt }
let ackTurn = 0;

const isPresent = c => c === claude || (c && agents.get(c.id) === c);
const pendingOf = c => [...jobs.values()].filter(j => j.from === c).length;

function delegate(from, ev) {
  const room = roomForTool(ev.tool);
  if (room === 'home') { // 서브에이전트 부르기·메시지 보내기: 자기 자리에서 전화
    from.phoneUntil = now() + 2600;
    from.say('speech', ev.label, 2200);
    log(from, ev.label);
    return;
  }
  const worker = room === 'boss' ? human : residents[room];
  const job = { id: ev.id, from, worker, room, label: ev.label, landed: false, startedAt: 0, result: null, done: false, createdAt: now() };
  jobs.set(ev.id, job);
  from.say('speech', `${worker === human ? '집사님' : worker.name}~ ${ev.label}`, 1800);
  log(from, `📨 ${worker.name} · ${ev.label}`);
  sendLetter(from, worker, false, () => land(job));
}

function land(job) {
  if (job.done) return;
  job.landed = true;
  const w = job.worker;
  w.jobs.add(job);
  if (w === human) {
    w.label = job.label;
    return startJob(job);
  }
  if (meeting) meeting.people.delete(w);
  if (atDesk(w) && w.state !== 'going') {
    if (w.jobs.size === 1) w.say('speech', ACK[w.homeRoom][ackTurn++ % 3], 1000);
    residentWork(w, job.label);
    return startJob(job);
  }
  // 산책·수다·회의 중에 일을 받으면 책상으로 뛰어가서, 도착한 순간부터 일한다
  w.label = job.label;
  if (w.state === 'going') return;
  w.state = 'going';
  w.say('speech', pick(['바로 갈게냥! 💨', '앗 일이다!', '가요 가요!']), 1200);
  goDesk(w, () => {
    residentWork(w, w.label);
    for (const j of w.jobs) if (!j.startedAt) startJob(j);
  });
}

function startJob(job) {
  job.startedAt = now();
  maybeFinish(job);
}

function onResult(ev) {
  const job = jobs.get(ev.id);
  if (!job) return;
  job.from.lastAt = now();
  job.result = { err: !!ev.err, text: ev.text || '' };
  maybeFinish(job);
  // 30초 안에 두 번 실패하면 긴급 회의
  if (ev.err) {
    errTimes = errTimes.filter(t => now() - t < 30 * 1000).concat(now());
    if (errTimes.length >= 2) { errTimes = []; callMeeting('urgent'); }
  }
}

// 할 일 목록이 새로 짜이면(첫 항목이나 개수가 바뀌면) 계획 회의
let lastTodos = [];
function onTodos(items) {
  const fresh = !lastTodos.length || items.length !== lastTodos.length || (items[0] && items[0].t) !== (lastTodos[0] && lastTodos[0].t);
  lastTodos = items;
  setTodos(items);
  if (fresh && items.some(x => x.s !== 'completed')) callMeeting('plan');
}

function maybeFinish(job) {
  if (job.done || !job.startedAt || !job.result || job.waiting) return;
  const wait = job.startedAt + MIN_WORK - now();
  if (wait > 0) { job.waiting = true; after(wait, () => { job.waiting = false; maybeFinish(job); }); return; }
  finish(job, true);
}

// reply=false 면 답장 없이 조용히 끝낸다(중단된 일, 오래 걸려 잊은 일)
function finish(job, reply) {
  if (job.done) return;
  job.done = true;
  jobs.delete(job.id);
  const w = job.worker;
  w.jobs.delete(job);
  const err = !!(job.result && job.result.err);
  const rest = [...w.jobs];
  w.label = rest.length ? rest[rest.length - 1].label : '';
  if (w !== human && !rest.length) w.restAt = now();
  if (err) {
    w.sweatUntil = now() + 4500;
    w.say('error', '💦 ' + (job.result.text || '실패했어요…'), 4500);
    log(w, '💦 ' + (job.result.text || '실패'), 'err');
  } else if (w === human && reply) {
    w.say('speech', '👍 답했어요', 1500);
  }
  if (reply && job.landed && isPresent(job.from)) {
    sendLetter(w, job.from, err, () => { if (err && isPresent(job.from)) job.from.sweatUntil = now() + 2000; });
  }
}

function dropJobsOf(c) {
  for (const j of [...jobs.values()]) if (j.from === c) finish(j, false);
}

// ───────────────────────── 회의 ─────────────────────────

const MEETINGS = {
  kickoff: { title: '📢 킥오프 회의!', boss: true, talk: ['좋아요!', '어디부터 볼까요?', '맡겨줘냥', '일정은요?', '👍', '바로 시작!'] },
  plan:    { title: '🗒️ 계획 회의!', boss: true, talk: ['순서 좋네요', '🤔', '이건 제가 할게요', '찬성!', '화이트보드 봐주세요', '냥냥'] },
  urgent:  { title: '🚨 긴급 회의!', boss: true, talk: ['원인이 뭘까요?', '로그 봤어요?', '💦', '다시 해봐요!', '침착하게냥', '🤔'] },
  tea:     { title: '🍵 티타임!', boss: false, talk: ['츄르 맛있다', '날씨 좋다냥', '하암~', '🐟', '그루밍 좀 할게', '냥냥'] },
};
let meeting = null; // { kind, until, people:Set, nextChat }
let lastMeetingEnd = -Infinity; // 마지막 "일" 회의가 끝난 시각(티타임은 세지 않는다)
let nextTea = 0;
let errTimes = [];

// 회의를 열 수 있으면 true. 일하는 고양이는 빠지고, 쉬는 고양이만 회의실 테이블로 모인다.
function callMeeting(kind) {
  const t = now();
  const spec = MEETINGS[kind];
  if (meeting) {
    if (meeting.kind !== 'tea' || kind === 'tea') { meeting.until = Math.max(meeting.until, t + 3000); return true; }
    endMeeting();
  }
  if (kind !== 'urgent' && t - lastMeetingEnd < MEET_COOLDOWN) return false;
  const people = [];
  if (spec.boss && claude) people.push(claude);
  for (const r of residentList) if (!r.jobs.size && r.state !== 'going') people.push(r);
  if (people.length < (spec.boss ? 2 : 3)) return false;
  meeting = { kind, until: t + (kind === 'tea' ? 9000 : MEET_LEN), people: new Set(people), nextChat: t + 2200 };
  const host = spec.boss ? claude : pick(people);
  host.say('speech', spec.title, 1800);
  log(host, spec.title, 'meet');
  for (const p of people) joinMeeting(p);
  return true;
}

function joinMeeting(p) {
  if (p === claude) {
    wake(p);
    sendTo(p, 'meet', () => { p.face = 'down'; p.pose = 'sit'; });
    return;
  }
  if (p.state === 'doze') p.say('speech', '냐? 회의?', 1000);
  p.state = 'meeting';
  if (p === residents.meeting) { goDesk(p, () => { p.face = 'down'; p.pose = 'sit'; }); return; } // 기획냥은 화이트보드 앞에서 발표
  const seat = takeSpot('meet', p);
  p.goTo(seat, () => { p.face = seat.face; p.pose = 'sit'; });
}

function endMeeting() {
  const m = meeting;
  meeting = null;
  if (m.kind !== 'tea') lastMeetingEnd = now();
  for (const p of m.people) {
    if (p === claude) {
      if (claude.room === 'meet') { claude.say('speech', '자, 각자 자리로! 🐾', 1500); sendTo(claude, 'home'); }
      continue;
    }
    if (p.state !== 'meeting') continue; // 이미 일하러 갔다
    p.state = 'homing';
    goDesk(p, settle(p), true);
  }
}

function tickMeeting() {
  const t = now();
  if (!meeting) {
    if (t >= nextTea) {
      nextTea = t + rand(...TEA_EVERY);
      if (!jobs.size) callMeeting('tea');
    }
    return;
  }
  if (t >= meeting.until) return endMeeting();
  if (t < meeting.nextChat) return;
  meeting.nextChat = t + rand(1100, 1900);
  const talkers = [...meeting.people].filter(p => !p.path.length && !(p.jobs && p.jobs.size));
  if (talkers.length) pick(talkers).say('speech', pick(MEETINGS[meeting.kind].talk), 1300);
}

// ───────────────────────── 엘리베이터 ─────────────────────────

const lift = { open: 0, until: 0, side: 0 };
const openLift = ms => { lift.until = Math.max(lift.until, now() + ms); };
function updateLift(dt) {
  const want = now() < lift.until ? 1 : 0;
  lift.open += Math.sign(want - lift.open) * Math.min(Math.abs(want - lift.open), dt * 2.5);
}

// ───────────────────────── 이벤트 처리 ─────────────────────────

function handle(ev) {
  if (ev.k === 'spawn') return void spawnAgent(ev);
  if (ev.k === 'todos') return onTodos(ev.items);
  if (ev.k === 'result') return onResult(ev);
  const c = catOf(ev.a);
  if (!c) return;
  c.lastAt = now();
  const inMeeting = !!meeting && meeting.people.has(c);
  switch (ev.k) {
    case 'tool':
      wake(c);
      if (c.phase === 'report' || c.phase === 'leave') backToWork(c);
      if (c === claude && c.room !== 'home' && !inMeeting) sendTo(c, 'home');
      return delegate(c, ev);
    case 'think':
      wake(c);
      if (c === claude && c.room !== 'home' && !inMeeting) sendTo(c, 'home');
      c.chinUntil = now() + 3500;
      c.say('thought', ev.text || '음…', 3500);
      if (ev.text) log(c, '💭 ' + ev.text, 'think');
      return;
    case 'say':
      c.say('speech', ev.text, 5000);
      log(c, '💬 ' + ev.text);
      return;
    case 'end':
      after(1500, () => {
        if (now() - c.lastAt < 1400) return;
        dropJobsOf(c);
        if (c.phase === 'work') goIdle(c);
      });
      return;
    case 'prompt':
      human.say('speech', ev.text, 6000);
      log(human, '🗣️ ' + ev.text);
      wake(c);
      c.phase = 'work';
      c.say('speech', '냥! 🐾', 1500);
      // 새 요청이 오면 한가한 고양이들을 모아 킥오프 회의부터
      if (c !== claude || !callMeeting('kickoff')) sendTo(c, 'home');
      return;
    case 'done':
      return agentDone(c);
  }
}

// 보고하러 가다가 일을 또 받은 서브에이전트는 다시 자리로 돌아간다
function backToWork(c) {
  c.phase = 'work';
  c.fade = 1;
  c.room = null;
  c.say('speech', '앗, 일 하나 더! 💨', 1800);
  sendTo(c, 'seat');
}

function spawnAgent(ev, instant = false) {
  let c = agents.get(ev.a);
  if (c) {
    if (c.phase === 'report' || c.phase === 'leave') backToWork(c);
    return c;
  }
  const look = S.lookFor(ev.type);
  c = new Cat(ev.a, look, look.name || ev.type || 'agent');
  c.desc = ev.desc || '';
  agents.set(ev.a, c);
  if (instant) return c;
  const [dx, dy] = O.LIFT_DOORS[lift.side++ % 2];
  c.x = dx * TILE; c.y = dy * TILE; c.alpha = 0; c.fade = 1; c.phase = 'arrive';
  openLift(1800);
  log(c, '🛗 출근 — ' + (c.desc || ev.type), 'agent');
  after(500, () => {
    if (c.phase !== 'arrive') return;
    c.phase = 'work';
    sendTo(c, 'seat', () => c.say('speech', '출근했습니다! 🐾', 1800));
  });
  return c;
}

// 일이 끝난 서브에이전트: Claude 옆으로 가서 보고 → 인사 → 엘리베이터로 퇴근
function agentDone(c) {
  if (c.phase === 'leave' || c.phase === 'report') return;
  c.phase = 'report'; c.room = null;
  dropJobsOf(c);
  release(c);
  const [rx, ry] = O.nearestFree(Math.round(claude.x / TILE), Math.round(claude.y / TILE), (x, y) => !occupied(x, y, c));
  c.goTo({ x: rx, y: ry, face: faceTo(rx, ry, claude), pose: 'stand' }, () => {
    if (c.phase !== 'report') return;
    c.say('speech', '📋 보고드립니다!' + (c.desc ? ' ' + c.desc : ''), 2000);
    after(2000, () => {
      if (c.phase !== 'report') return;
      c.phase = 'leave';
      c.say('speech', '👋 퇴근합니다!', 2600);
      claude.say('speech', '수고했어요 🐾', 1800);
      log(c, '👋 퇴근합니다!', 'agent');
      const [dx, dy] = O.LIFT_DOORS[lift.side++ % 2];
      c.goTo({ x: dx, y: dy + 1, face: 'up', pose: 'stand' }, () => {
        if (c.phase !== 'leave') return;
        openLift(1600);
        after(450, () => {
          if (c.phase !== 'leave') return;
          c.goTo({ x: dx, y: dy, face: 'up', pose: 'stand' }, () => {
            c.fade = -1;
            after(450, () => { if (c.phase === 'leave') { c.remove(); agents.delete(c.id); } });
          });
        });
      });
    });
  });
}

// ───────────────────────── Claude 쉬는 시간 ─────────────────────────

function goIdle(c, quietMs = 0) {
  if (c !== claude) return; // 서브에이전트는 자리에서 대기
  c.phase = 'idle';
  c.idleSince = now() - quietMs;
  c.idleAct = null;
  c.nextIdle = 0;
  log(c, '☕ 한숨 돌리는 중');
}

function tickIdle(c) {
  if (!c || c.phase !== 'idle' || now() < c.nextIdle || (meeting && meeting.people.has(c))) return;
  c.nextIdle = now() + 5000;
  let act = 'desk';
  try {
    act = chooseIdleActivity((now() - c.idleSince) / 1000, {
      hour: new Date().getHours(),
      agentsBusy: [...agents.values()].filter(a => a.phase === 'work').length,
    });
  } catch (e) { console.warn('chooseIdleActivity 오류:', e); }
  if (!['desk', 'groom', 'wander', 'nap'].includes(act)) act = 'desk';
  if (act === c.idleAct && act !== 'wander') return;
  c.idleAct = act;
  if (act === 'desk') sendTo(c, 'home', () => { c.pose = 'sit'; c.face = 'down'; });
  else if (act === 'nap') sendTo(c, 'nap');
  else if (act === 'groom') {
    const groom = () => { c.pose = 'groom'; c.face = 'down'; };
    if (c.path.length) c.then = groom; else groom();
  } else if (act === 'wander') {
    const r = O.ROOMS.hall;
    for (let k = 0; k < 40; k++) {
      const x = r.x0 + Math.floor(Math.random() * (r.x1 - r.x0 + 1)), y = r.y0 + Math.floor(Math.random() * (r.y1 - r.y0 + 1));
      if (!O.walkable(x, y) || occupied(x, y, c)) continue;
      release(c);
      c.room = null;
      c.goTo({ x, y, face: 'down', pose: 'stand' });
      break;
    }
  }
}

function autoIdle() {
  const t = now();
  for (const j of [...jobs.values()]) if (t - j.createdAt > STUCK_AFTER) finish(j, false);
  if (claude && claude.phase === 'work' && !pendingOf(claude) && t - claude.lastAt > IDLE_AFTER) goIdle(claude);
}

// ───────────────────────── 스냅샷(처음 들어왔을 때 상태) ─────────────────────────

function reset(snap) {
  for (const c of agents.values()) c.remove();
  agents.clear();
  claims.clear();
  jobs.clear();
  letters.length = 0;
  timers = [];
  meeting = null;
  lastMeetingEnd = -Infinity;
  nextTea = now() + rand(...TEA_EVERY);
  errTimes = [];
  lastTodos = snap.todos || [];
  residentList.forEach(residentReset);
  human.jobs.clear();
  human.label = '';
  if (claude) claude.remove();
  claude = new Cat('main', S.LOOKS.claude, S.LOOKS.claude.name);
  claude.room = 'home';
  claude.place(takeSpot('home', claude));
  const m = snap.main || {};
  const busy = m.tool && m.status === 'work' && m.quietMs < IDLE_AFTER;
  if (m.quietMs < IDLE_AFTER) claude.lastAt = now() - m.quietMs;
  else goIdle(claude, m.quietMs || 0);
  // 방금까지 일하던 방은 잠깐 일하는 모습으로 시작한다
  const showWork = (tool, label) => {
    const r = residents[roomForTool(tool)];
    if (!r) return;
    residentWork(r, label || '');
    r.restAt = now() + 3000;
  };
  if (busy) showWork(m.tool, m.label);
  for (const a of snap.agents || []) {
    const c = spawnAgent({ a: a.a, type: a.type, desc: a.desc }, true);
    c.room = 'seat';
    c.place(takeSpot('seat', c));
    if (a.tool) showWork(a.tool, a.label);
  }
  setTodos(snap.todos || []);
  logList.innerHTML = '';
  const f = floorOf(current);
  log(claude, `🏢 ${f ? f.floor + 'F ' + f.name : ''} 사무실 출근 완료`);
}

// ───────────────────────── 그리기 ─────────────────────────

const world = {
  isActive(room) { const r = room && residents[room]; return !!r && r.state === 'work'; },
  get serverBusy() { return world.isActive('server'); },
};

function drawCat(c, t) {
  const tn = now();
  if (c.human) { g.drawImage(S.sprite(S.HUMAN_FRONT, c.look), Math.round(c.x), Math.round(c.y)); return; }
  const walking = c.path.length > 0;
  const step = walking && Math.floor(t * (c.speed > 120 ? 12 : 7)) % 2 === 1;
  const chin = !walking && tn < c.chinUntil;
  const phone = !walking && tn < c.phoneUntil;
  const front = c.face !== 'up' || chin || phone;
  if (tn > c.nextBlink + 140) c.nextBlink = tn + 2500 + Math.random() * 3500;
  const blink = tn > c.nextBlink;
  const sleeping = !walking && c.pose === 'sleep';
  let rows;
  if (sleeping) rows = S.CAT_SLEEP;
  else if (!front) rows = step ? S.CAT_BACK_STEP : S.CAT_BACK;
  else if (step) rows = S.CAT_FRONT_STEP;
  else if (blink) rows = S.CAT_FRONT_BLINK;
  else rows = c.face === 'left' ? S.CAT_FRONT_LEFT : c.face === 'right' ? S.CAT_FRONT_RIGHT : S.CAT_FRONT;
  const X = Math.round(c.x), Y = Math.round(c.y + (walking ? 0 : c.oy)) - (step ? 1 : 0);
  g.globalAlpha = c.alpha;
  g.drawImage(S.sprite(rows, c.look), X, Y);
  if (c.look.hat && !sleeping) S.stamp(g, S.OV.hat, c.look, X, Y);
  if (c.look.glasses && front && !sleeping) S.stamp(g, S.OV.glasses, c.look, X, Y);
  if (!walking) {
    if (phone) S.stamp(g, S.OV.phone, c.look, X, Y);
    else if (chin) S.stamp(g, S.OV.chin, c.look, X, Y);
    else if (c.pose === 'read' && front) {
      S.stamp(g, S.OV.book, c.look, X, Y);
      S.stamp(g, Math.floor(t * 1.5) % 2 ? S.OV.bookLineA : S.OV.bookLineB, c.look, X, Y);
    } else if (!front && (c.pose === 'type' || c.pose === 'write')) {
      S.stamp(g, Math.floor(t * 6) % 2 ? S.OV.pawsUpA : S.OV.pawsUpB, c.look, X, Y);
    } else if (!front && c.pose === 'rack') {
      S.stamp(g, Math.floor(t * 2) % 2 ? S.OV.pawsUpA : S.OV.pawsUpB, c.look, X, Y);
    } else if (c.pose === 'groom' && front) {
      S.stamp(g, Math.floor(t * 3) % 2 ? S.OV.groomA : S.OV.groomB, c.look, X, Y);
    }
  }
  if (tn < c.sweatUntil && !sleeping) S.stamp(g, S.OV.sweat, c.look, X, Y);
  g.globalAlpha = 1;
}

function placeUi(c) {
  const walking = c.path.length > 0;
  c.el.style.transform = `translate(${(c.x + 8) * scale}px, ${(c.y + (walking ? 0 : c.oy) + 1) * scale}px)`;
  c.el.style.opacity = c.alpha;
  // 회의 테이블에 나란히 앉으면 이름표가 겹치니 색 점만 남긴다
  c.el.classList.toggle('crowd', !walking && !!meeting && meeting.people.has(c));
  const tn = now();
  let b = c.bubble && tn < c.bubble.until ? c.bubble : null;
  if (!b && !walking && c.pose === 'sleep') b = { kind: 'zzz', text: 'z Z z' };
  if (!b && c.label) b = { kind: 'label', text: c.label };
  const key = b ? b.kind + '|' + b.text : '';
  if (key === c.bubbleKey) return;
  c.bubbleKey = key;
  c.bubbleEl.className = 'bubble ' + (b ? b.kind : 'hidden');
  c.bubbleEl.textContent = b ? b.text : '';
}

function step(dt) {
  simMs += dt * 1000;
  runTimers();
  updateLift(dt);
  for (const c of everyone()) c.update(dt);
  tickLetters();
  tickResidents();
  tickAgents();
  tickMeeting();
  autoIdle();
  tickIdle(claude);
}

function render() {
  const t = simMs / 1000;
  g.drawImage(bg, 0, 0);
  O.drawLift(g, lift.open);
  const cats = [...everyone(), human];
  const items = O.FURNITURE.map(f => ({ z: f.z, f }));
  for (const c of cats) items.push({ z: c.y + TILE, c });
  items.sort((a, b) => a.z - b.z);
  for (const it of items) (it.f ? O.drawFurniture(g, it.f, t, world) : drawCat(it.c, t));
  drawLetters();
  for (const c of cats) placeUi(c);
}

let last = performance.now();
function frame() {
  requestAnimationFrame(frame);
  const tn = performance.now();
  // 창이 가려지면 브라우저가 프레임을 줄이거나 멈춘다. 돌아왔을 때 한꺼번에 몰아 진행하지 않도록 0.5초로 자른다.
  step(Math.min(0.5, (tn - last) / 1000));
  last = tn;
  render();
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
  openLift(1400);
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
      advance(sec) { for (let i = 0; i < sec * 30; i++) step(1 / 30); render(); }, // 시간 빨리 감기
      cats: () => [...everyone(), human].map(c => ({ id: c.id, x: c.x, y: c.y, path: c.path.length, phase: c.phase, state: c.state, pose: c.pose, label: c.label, jobs: c.jobs ? c.jobs.size : undefined })),
      letters: () => letters.length,
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
