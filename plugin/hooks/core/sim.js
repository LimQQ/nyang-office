// ⚠️ public/js/sim.js 의 복사본입니다. 원본을 고친 뒤 `node scripts/sync-plugin.js` 로 다시 복사하세요.
// 냥냥 오피스의 움직임 전부: 고양이 · 편지 · 회의 · 쉬는 시간 · 깜짝 사건 · 낮과 밤.
// 화면(DOM)을 모른다. 웹 화면(main.js)은 캔버스에, Claude 앱 패널(plugin/)은 SVG 에 그린다.
//
//   const office = createOffice({ log, todos, saveStats, stats })
//   office.handle(ev)        세션 이벤트 하나 (prompt / tool / result / think / say / end / spawn / done / todos)
//   office.step(dt)          시간 dt 초 흐르기
//   office.draw(g)           캔버스 같은 g(fillStyle · fillRect · globalAlpha · drawImage)에 배경 위 모든 것 그리기
//   office.uiOf(cat)         고양이 머리 위 말풍선 · 이름표
//   office.pet(id)           쓰다듬기
import * as O from './office.js';
import * as S from './sprites.js';
import { chooseIdleActivity } from './idle.js';

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
const CHURU_EVERY = 12;            // 일을 이만큼 성공하면 츄르 택배가 온다
const SURPRISE_EVERY = [45 * 1000, 100 * 1000]; // 조용할 때 깜짝 사건 간격
const CHAMP_MIN = 3;               // 이만큼은 일해야 오늘의 사원 왕관을 쓴다

const pick = a => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

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

// 창문(개발실 바깥벽): 새가 앉는 곳
export const WINDOWS = [[16, 0], [19, 0]];

// 작은 도트 소품: [x, y, 색]
const HEART = [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]];
const CROWN = [[0, 0], [2, 0], [4, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2]];

// hooks: { log(cat, text, kind), todos(items), saveStats(stats), stats, hour() }
export function createOffice(hooks = {}) {
  const log = hooks.log || (() => {});
  const setTodos = hooks.todos || (() => {});
  const saveStats = hooks.saveStats || (() => {});
  const hourNow = hooks.hour || (() => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; });

  // 모든 예약·말풍선·걷기는 이 시뮬레이션 시계를 따른다.
  let simMs = 0;
  const now = () => simMs;

  // ───────────────────────── 오늘의 기록 ─────────────────────────

  let stats = freshStats(hooks.stats);
  function freshStats(s) {
    if (s && s.day === today() && s.done) return { day: s.day, done: { ...s.done }, pets: s.pets || 0, sinceChuru: s.sinceChuru || 0, churus: s.churus || 0 };
    return { day: today(), done: {}, pets: 0, sinceChuru: (s && s.sinceChuru) || 0, churus: 0 };
  }
  function bump(fn) {
    if (stats.day !== today()) stats = freshStats(null);
    fn(stats);
    saveStats(stats);
  }

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
    const t = randomTile(O.ROOMS.hall, cat) || [O.ROOMS.hall.x0, O.ROOMS.hall.y0];
    return { x: t[0], y: t[1], face: 'down', oy: 0, pose: 'stand' };
  }

  function release(cat) {
    if (cat.claim && claims.get(cat.claim) === cat) claims.delete(cat.claim);
    cat.claim = null;
  }

  function occupied(x, y, except) {
    return everyone().some(c => c !== except && c.target && Math.floor(c.target.x) === x && Math.floor(c.target.y) === y);
  }

  function randomTile(room, cat) {
    for (let k = 0; k < 40; k++) {
      const x = room.x0 + Math.floor(Math.random() * (room.x1 - room.x0 + 1));
      const y = room.y0 + Math.floor(Math.random() * (room.y1 - room.y0 + 1));
      if (O.walkable(x, y) && !occupied(x, y, cat)) return [x, y];
    }
    return null;
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
      this.sweatUntil = 0; this.chinUntil = 0; this.phoneUntil = 0; this.petUntil = 0;
      this.nextBlink = now() + 2000 + Math.random() * 3000;
      this.label = ''; this.bubble = null;
    }

    place(spot) {
      this.target = spot;
      this.x = spot.x * TILE;
      this.y = spot.y * TILE;
      this.path = [];
      this.arrive();
    }

    goTo(spot, then, { slow = false, speed = 0 } = {}) {
      this.target = spot;
      this.then = then || null;
      const sx = Math.round(this.x / TILE), sy = Math.round(this.y / TILE);
      this.path = O.findPath(sx, sy, Math.floor(spot.x), Math.floor(spot.y)).map(([x, y]) => [x * TILE, y * TILE]);
      this.path.push([spot.x * TILE, spot.y * TILE]); // 반 칸 자리 보정
      this.oy = 0;
      let len = 0, px = this.x, py = this.y;
      for (const [x, y] of this.path) { len += Math.hypot(x - px, y - py); px = x; py = y; }
      this.speed = speed || (slow ? ROAM_SPEED : Math.max(SPEED, len / TRIP_SEC));
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

    remove() { release(this); this.gone = true; }
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
    if (surprise && surprise.people.has(c)) surprise.people.delete(c);
    c.phase = 'work';
    c.idleAct = null;
  }

  // ───────────────────────── 담당 고양이 상태 ─────────────────────────

  // state: work 일하는 중 · ready 자리에서 쉼 · roam 돌아다님 · homing 자리로 돌아가는 중
  //        going 일하러 뛰어가는 중 · meeting 회의 중 · doze 자리에서 졺 · fun 깜짝 사건에 끼어 있음
  const CHAT = ['냥?', '오늘 뭐 해냥', '츄르 먹을래?', '간식 있어?', '고생했어냥', '창밖에 새 봤어?'];
  const REPLY = ['냥!', '좋아냥!', '나중에~', '😺', '냐옹', '나도 봤어!'];
  const YAWN = ['하암~', '기지개 쭈욱~', '졸리다냥', '🐟 생각 중'];

  const atDesk = r => !r.path.length && Math.abs(r.x - r.desk.x * TILE) < 1 && Math.abs(r.y - r.desk.y * TILE) < 1;
  const isFree = r => !r.jobs.size && (r.state === 'ready' || r.state === 'roam' || r.state === 'doze' || r.state === 'homing');

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
      if (r.jobs.size || r.state === 'going' || r.state === 'meeting' || r.state === 'fun') continue;
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

  function drawLetters(g) {
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
    if (surprise) surprise.people.delete(w);
    if (atDesk(w) && w.state !== 'going') {
      if (w.jobs.size === 1) w.say('speech', ACK[w.homeRoom][ackTurn++ % 3], 1000);
      residentWork(w, job.label);
      return startJob(job);
    }
    // 산책·수다·회의·깜짝 사건 중에 일을 받으면 책상으로 뛰어가서, 도착한 순간부터 일한다
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
    if (reply && !err) {
      const fromId = job.from === claude ? 'main' : 'agent';
      bump(s => { s.done[w.id] = (s.done[w.id] || 0) + 1; s.done[fromId] = (s.done[fromId] || 0) + 1; s.sinceChuru++; });
      if (stats.sinceChuru >= CHURU_EVERY) churuPending = true;
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
    if (surprise) endSurprise(true);
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
        if (!jobs.size && !surprise) callMeeting('tea');
      }
      return;
    }
    if (t >= meeting.until) return endMeeting();
    if (t < meeting.nextChat) return;
    meeting.nextChat = t + rand(1100, 1900);
    const talkers = [...meeting.people].filter(p => !p.path.length && !(p.jobs && p.jobs.size));
    if (talkers.length) pick(talkers).say('speech', pick(MEETINGS[meeting.kind].talk), 1300);
  }

  // ───────────────────────── 깜짝 사건 · 츄르 택배 ─────────────────────────
  // surprise = { kind, until, people:Set, ... }  kind: churu · box · bird · laser

  let surprise = null;
  let nextSurprise = 0;
  let churuPending = stats.sinceChuru >= CHURU_EVERY;

  // 한가한 담당 고양이(+ 쉬고 있는 팀장냥)를 n 마리까지 모은다
  function gather(n, withBoss) {
    const free = residentList.filter(isFree);
    const out = [];
    for (const r of free.sort(() => Math.random() - 0.5)) { if (out.length < n) out.push(r); }
    if (withBoss && claude && claude.phase === 'idle' && !(meeting && meeting.people.has(claude))) out.push(claude);
    return out;
  }

  function enlist(p) {
    if (p === claude) { release(p); p.room = null; p.idleAct = 'fun'; return; }
    if (p.state === 'doze') p.say('speech', '냐? 무슨 일?', 1000);
    release(p);
    p.state = 'fun';
  }

  function startSurprise(kind) {
    if (surprise || meeting) return false;
    const t = now();
    if (kind === 'churu') {
      const people = gather(5, true);
      if (people.length < 2) return false;
      const spot = [15, 10];
      surprise = { kind, until: t + 11000, people: new Set(people), at: spot, nextChat: t + 3000 };
      bump(s => { s.sinceChuru = 0; s.churus++; });
      churuPending = false;
      openLift(1800);
      log(people[0], '📦 츄르 택배 도착! 다 같이 간식 시간', 'meet');
      people[0].say('speech', '📦 츄르 택배다!', 1800);
      for (const p of people) {
        enlist(p);
        const [x, y] = O.nearestFree(spot[0], spot[1], (x, y) => !occupied(x, y, p) && !(x === spot[0] && y === spot[1]));
        p.goTo({ x, y, face: faceTo(x, y, { x: spot[0] * TILE, y: spot[1] * TILE }), pose: 'stand' }, () => {
          if (!surprise || !surprise.people.has(p)) return;
          p.pose = 'groom';
          p.say('speech', pick(['츄르다!', '냠냠', '🐟💕', '최고야냥']), 1500);
        });
      }
      return true;
    }
    if (kind === 'box') {
      const [p] = gather(1, false);
      const tile = randomTile(O.ROOMS.hall, p);
      if (!p || !tile) return false;
      surprise = { kind, until: t + 16000, people: new Set([p]), at: tile, nextChat: t + 4000 };
      log(p, '📦 복도에 빈 상자가 생겼다…', 'meet');
      enlist(p);
      p.say('speech', '어? 상자다!', 1500);
      after(1200, () => {
        if (!surprise || surprise.kind !== 'box' || !surprise.people.has(p)) return;
        p.goTo({ x: tile[0], y: tile[1], face: 'down', pose: 'sit', oy: 2 }, () => {
          if (!surprise || !surprise.people.has(p)) return;
          surprise.inBox = p;
          p.say('speech', '딱 맞아 🥰', 2000);
        });
      });
      return true;
    }
    if (kind === 'bird') {
      const people = gather(4, true);
      if (!people.length) return false;
      const win = pick(WINDOWS);
      surprise = { kind, until: t + 12000, people: new Set(people), win, nextChat: t + 2500, birdAt: t };
      log(people[0], '🐦 창밖에 새가 왔다!', 'meet');
      people[0].say('speech', '새다!! 🐦', 1500);
      for (const p of people) {
        enlist(p);
        const [x, y] = O.nearestFree(win[0], 2, (x, y) => !occupied(x, y, p) && O.roomAt(x, y) === 'dev');
        p.goTo({ x, y, face: 'up', pose: 'stand' }, () => { if (surprise && surprise.people.has(p)) p.face = 'up'; });
      }
      return true;
    }
    if (kind === 'laser') {
      const people = gather(3, true);
      if (people.length < 2) return false;
      const dot = randomTile(O.ROOMS.hall, null) || [15, 10];
      surprise = { kind, until: t + 12000, people: new Set(people), dot: [dot[0] * TILE + 8, dot[1] * TILE + 10], dotTo: null, nextHop: t, nextChat: t + 2000 };
      log(people[0], '🔴 레이저 포인터 발견!', 'meet');
      people[0].say('speech', '빨간 점이다!!', 1500);
      for (const p of people) enlist(p);
      return true;
    }
    return false;
  }

  function endSurprise(quiet = false) {
    const s = surprise;
    surprise = null;
    nextSurprise = now() + rand(...SURPRISE_EVERY);
    if (!s) return;
    if (!quiet) {
      const talker = [...s.people][0];
      if (talker) talker.say('speech', { churu: '잘 먹었습니다 😽', box: '만족했다냥', bird: '날아갔다… 🥲', laser: '헉헉… 못 잡았다' }[s.kind], 1800);
    }
    for (const p of s.people) {
      if (p === claude) { if (claude.phase === 'idle') { claude.idleAct = null; claude.nextIdle = 0; } continue; }
      if (p.state !== 'fun') continue;
      p.state = 'homing';
      p.oy = 0;
      goDesk(p, settle(p), true);
    }
  }

  function tickSurprise() {
    const t = now();
    if (!surprise) {
      if (meeting || jobs.size) return;
      if (churuPending) { startSurprise('churu'); return; }
      if (t >= nextSurprise) {
        nextSurprise = t + rand(...SURPRISE_EVERY);
        startSurprise(pick(['box', 'bird', 'laser', 'box', 'bird', 'laser']));
      }
      return;
    }
    const s = surprise;
    for (const p of [...s.people]) if (p !== claude && p.state !== 'fun') s.people.delete(p);
    if (claude && s.people.has(claude) && claude.phase !== 'idle') s.people.delete(claude);
    if (t >= s.until || !s.people.size) return endSurprise(!s.people.size);
    if (s.kind === 'laser') {
      // 점이 이리저리 튀고, 고양이들이 우르르 쫓아간다
      if (t >= s.nextHop) {
        s.nextHop = t + rand(900, 1500);
        const tile = randomTile(O.ROOMS.hall, null);
        if (tile) s.dotTo = [tile[0] * TILE + 8, tile[1] * TILE + 10];
        let i = 0;
        for (const p of s.people) {
          const tx = Math.floor((s.dotTo || s.dot)[0] / TILE), ty = Math.floor((s.dotTo || s.dot)[1] / TILE);
          const [x, y] = i++ === 0 ? [tx, ty] : O.nearestFree(tx, ty, (x, y) => !occupied(x, y, p));
          p.goTo({ x, y, face: 'down', pose: 'stand' }, null, { speed: 90 });
        }
      }
      if (s.dotTo) {
        const dx = s.dotTo[0] - s.dot[0], dy = s.dotTo[1] - s.dot[1], d = Math.hypot(dx, dy);
        const v = 6;
        if (d <= v) s.dot = s.dotTo; else s.dot = [s.dot[0] + dx / d * v, s.dot[1] + dy / d * v];
      }
    }
    if (t >= s.nextChat) {
      s.nextChat = t + rand(1500, 2600);
      const talk = {
        churu: ['냠냠냠', '하나 더!', '츄르 최고', '🐟', '행복해냥'],
        box: ['여기 내 자리', '나가기 싫다냥', '😺', '상자는 진리'],
        bird: ['짹짹?', '깍깍깍깍', '잡고 싶다…', '귀엽다냥', '👀'],
        laser: ['잡았… 아니네', '저기다!', '냥!!', '💨💨'],
      }[s.kind];
      const idle = [...s.people].filter(p => !p.path.length || s.kind === 'laser');
      if (idle.length) pick(idle).say('speech', pick(talk), 1300);
    }
  }

  // ───────────────────────── 쓰다듬기 ─────────────────────────

  const hearts = []; // { x, y, t0 }

  function pet(id) {
    const c = [...everyone(), human].find(x => x.id === id);
    if (!c) return null;
    bump(s => { s.pets++; });
    c.petUntil = now() + 2200;
    for (let i = 0; i < 3; i++) hearts.push({ x: c.x + 3 + i * 4, y: c.y + (c.path.length ? 0 : c.oy) - 2, t0: now() + i * 220 });
    const n = (stats.done[c.id === 'main' ? 'main' : c.id] || 0);
    const count = c === claude ? `오늘 ${n}건 맡김` : c.human ? `오늘 ${n}번 대답` : c.jobs && !agents.has(c.id) ? `오늘 ${n}건` : '';
    let text;
    if (c.human) text = '고마워요 😊';
    else if (c.state === 'doze' || (c.pose === 'sleep' && !c.path.length)) {
      text = '냐…? 골골… 💕';
      if (c.state === 'doze') { c.state = 'ready'; c.pose = 'sit'; c.restAt = now(); c.nextIdleAt = now() + rand(4000, 9000); }
    } else if (c.jobs && c.jobs.size) text = '일하는 중이다냥! 💕';
    else text = pick(['골골골… 💕', '거기 좋아냥 💕', '😽 냐앙', '더 쓰다듬어 💕']);
    c.say('pet', count ? `${text} · ${count}` : text, 2200);
    return { name: c.name, count: n };
  }

  // 오늘 가장 많이 일한 담당 고양이
  function champion() {
    if (stats.day !== today()) return null;
    let best = null;
    for (const r of residentList) {
      const n = stats.done[r.id] || 0;
      if (n >= CHAMP_MIN && (!best || n > best.n)) best = { cat: r, n };
    }
    return best && { id: best.cat.id, name: best.cat.name, count: best.n };
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
    if (c.phase === 'leave' || c.phase === 'report' || !claude) return;
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
    if (surprise && surprise.people.has(c)) return;
    c.nextIdle = now() + 5000;
    let act = 'desk';
    try {
      act = chooseIdleActivity((now() - c.idleSince) / 1000, {
        hour: Math.floor(hourNow()),
        agentsBusy: [...agents.values()].filter(a => a.phase === 'work').length,
      });
    } catch (e) { if (typeof console !== 'undefined') console.warn('chooseIdleActivity 오류:', e); }
    if (!['desk', 'groom', 'wander', 'nap'].includes(act)) act = 'desk';
    if (act === c.idleAct && act !== 'wander') return;
    const was = c.idleAct;
    c.idleAct = act;
    if (act === 'desk') sendTo(c, 'home', () => { c.pose = 'sit'; c.face = 'down'; });
    else if (act === 'nap') {
      if (was !== 'nap') log(c, '📦 상자 속에서 낮잠 💤');
      sendTo(c, 'nap');
    } else if (act === 'groom') {
      const groom = () => { c.pose = 'groom'; c.face = 'down'; };
      if (c.path.length) c.then = groom; else groom();
      if (was !== 'groom') c.say('speech', pick(['그루밍 타임 ✨', '할짝할짝', '털 정리 중']), 1500);
    } else if (act === 'wander') {
      const tile = randomTile(O.ROOMS.hall, c);
      if (tile) {
        release(c);
        c.room = null;
        c.goTo({ x: tile[0], y: tile[1], face: 'down', pose: 'stand' }, null, { slow: true });
        if (was !== 'wander') c.say('speech', pick(['산책 좀 할까냥', '복도 순찰!', '기지개 쭈욱~']), 1500);
      }
    }
  }

  function autoIdle() {
    const t = now();
    for (const j of [...jobs.values()]) if (t - j.createdAt > STUCK_AFTER) finish(j, false);
    if (claude && claude.phase === 'work' && !pendingOf(claude) && t - claude.lastAt > IDLE_AFTER) goIdle(claude);
  }

  // ───────────────────────── 스냅샷(처음 들어왔을 때 상태) ─────────────────────────

  function reset(snap = {}, title = '') {
    for (const c of agents.values()) c.remove();
    agents.clear();
    claims.clear();
    jobs.clear();
    letters.length = 0;
    hearts.length = 0;
    timers = [];
    meeting = null;
    surprise = null;
    lastMeetingEnd = -Infinity;
    nextTea = now() + rand(...TEA_EVERY);
    nextSurprise = now() + rand(...SURPRISE_EVERY);
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
    log(claude, `🏢 ${title ? title + ' ' : ''}사무실 출근 완료`);
  }

  // ───────────────────────── 그리기 ─────────────────────────

  const world = {
    isActive(room) { const r = room && residents[room]; return !!r && r.state === 'work'; },
    get serverBusy() { return world.isActive('server'); },
  };

  const px = (g, pts, ox, oy, col) => { g.fillStyle = col; for (const [x, y] of pts) g.fillRect(ox + x, oy + y, 1, 1); };

  function drawCat(g, c, t) {
    const tn = now();
    if (c.human) {
      g.drawImage(S.sprite(S.HUMAN_FRONT, c.look), Math.round(c.x), Math.round(c.y));
      return;
    }
    const walking = c.path.length > 0;
    const step = walking && Math.floor(t * (c.speed > 120 ? 12 : 7)) % 2 === 1;
    const chin = !walking && tn < c.chinUntil;
    const phone = !walking && tn < c.phoneUntil;
    const front = c.face !== 'up' || chin || phone;
    if (tn > c.nextBlink + 140) c.nextBlink = tn + 2500 + Math.random() * 3500;
    const blink = tn > c.nextBlink || (tn < c.petUntil && !walking); // 쓰다듬으면 눈을 지그시 감는다
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
    const champ = champion();
    if (champ && champ.id === c.id && !sleeping) { // 오늘의 사원 왕관
      px(g, CROWN, X + 6, Y - 3, '#f2c94c');
      g.fillStyle = '#d0504a'; g.fillRect(X + 8, Y - 2, 1, 1);
    }
    g.globalAlpha = 1;
  }

  // 창문: 바깥 하늘이 시간 따라 바뀐다
  function drawWindows(g, hour, t) {
    const sky = skyOf(hour);
    for (const [wx, wy] of WINDOWS) {
      const X = wx * TILE, Y = wy * TILE;
      g.fillStyle = '#8a7462'; g.fillRect(X + 1, Y + 4, 14, 11);
      g.fillStyle = sky.top; g.fillRect(X + 2, Y + 5, 12, 5);
      g.fillStyle = sky.bottom; g.fillRect(X + 2, Y + 10, 12, 4);
      if (sky.stars) { g.fillStyle = '#fff6c8'; g.fillRect(X + 4, Y + 6, 1, 1); g.fillRect(X + 10, Y + 8, 1, 1); if (Math.floor(t * 1.2 + wx) % 2) g.fillRect(X + 7, Y + 7, 1, 1); }
      if (wx === WINDOWS[0][0]) {
        if (sky.moon) { g.fillStyle = '#f6eebc'; g.fillRect(X + 9, Y + 6, 3, 3); g.fillStyle = sky.top; g.fillRect(X + 10, Y + 6, 2, 2); }
        else if (sky.sun) { g.fillStyle = sky.sun; g.fillRect(X + 9, Y + sky.sunY, 3, 3); }
      } else if (!sky.stars) { g.fillStyle = 'rgba(255,255,255,.85)'; const cx = X + 3 + Math.floor(t / 3) % 7; g.fillRect(cx, Y + 7, 4, 1); g.fillRect(cx + 1, Y + 6, 2, 1); }
      g.fillStyle = '#8a7462'; g.fillRect(X + 7, Y + 5, 1, 9); g.fillRect(X + 2, Y + 9, 12, 1);
      g.fillStyle = '#b39a84'; g.fillRect(X, Y + 14, 16, 2); // 창틀
    }
    if (surprise && surprise.kind === 'bird') {
      const [wx, wy] = surprise.win;
      const hop = Math.floor(t * 3) % 4 === 0 ? 1 : 0;
      const X = wx * TILE + 6, Y = wy * TILE + 10 - hop;
      g.fillStyle = '#6b4a3a'; g.fillRect(X, Y, 5, 3); g.fillRect(X + 1, Y - 1, 3, 1);
      g.fillStyle = '#e86b4f'; g.fillRect(X + 1, Y + 1, 2, 1);
      g.fillStyle = '#f2c94c'; g.fillRect(X + 5, Y, 1, 1);
      g.fillStyle = '#2a1f1a'; g.fillRect(X + 3, Y, 1, 1);
    }
  }

  function drawEffects(g, t) {
    const s = surprise;
    if (s && s.kind === 'churu') { // 츄르 상자
      const X = s.at[0] * TILE + 2, Y = s.at[1] * TILE + 3;
      g.fillStyle = '#c99a5e'; g.fillRect(X, Y + 2, 12, 9);
      g.fillStyle = '#ddb57c'; g.fillRect(X, Y + 2, 12, 2);
      g.fillStyle = '#e86b4f'; g.fillRect(X + 2, Y - 3, 2, 6); g.fillRect(X + 6, Y - 4, 2, 7); g.fillRect(X + 9, Y - 2, 2, 5);
      g.fillStyle = '#fff8ee'; g.fillRect(X + 4, Y + 6, 4, 2);
    }
    if (s && s.kind === 'laser') {
      const [x, y] = s.dot;
      g.fillStyle = 'rgba(255,60,60,.35)'; g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
      g.fillStyle = '#ff3030'; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
      g.fillStyle = '#ffd0d0'; g.fillRect(Math.round(x), Math.round(y) - 1, 1, 1);
    }
    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i];
      const age = (now() - h.t0) / 1000;
      if (age < 0) continue;
      if (age > 1.4) { hearts.splice(i, 1); continue; }
      g.globalAlpha = Math.max(0, 1 - age / 1.4);
      px(g, HEART, Math.round(h.x + Math.sin(age * 6 + i) * 2), Math.round(h.y - age * 14), '#ff6f91');
      g.globalAlpha = 1;
    }
  }

  // 낮과 밤: 시간에 따라 사무실 전체에 색을 덮고, 밤에는 책상 스탠드를 켠다
  function drawLight(g, hour) {
    const L = lightOf(hour);
    if (L.tint) { g.fillStyle = L.tint; g.fillRect(0, 0, O.PW, O.PH); }
    if (!L.lamps) return;
    const glow = (x, y, w, h) => { g.fillStyle = 'rgba(255,214,140,.16)'; g.fillRect(x - 4, y - 3, w + 8, h + 6); g.fillStyle = 'rgba(255,214,140,.14)'; g.fillRect(x, y, w, h); };
    const lateNight = hour >= 1 && hour < 5;
    if (!lateNight || (claude && claude.phase === 'work')) glow(14 * TILE, 3 * TILE, 3 * TILE, 3 * TILE); // 팀장 책상
    for (const r of residentList) if (r.state === 'work' || !lateNight) glow(Math.round(r.desk.x * TILE) - 8, Math.round(r.desk.y * TILE) - 10, 32, 30);
    if (!lateNight || human.jobs.size) glow(24 * TILE, 13 * TILE + 4, 3 * TILE, 2 * TILE);
    // 서버실은 밤새 반짝인다
    g.fillStyle = 'rgba(94,240,138,.08)'; g.fillRect(23 * TILE, TILE - 8, 8 * TILE, 3 * TILE);
  }

  function draw(g, opts = {}) {
    const t = simMs / 1000;
    const hour = opts.hour != null ? opts.hour : hourNow();
    drawWindows(g, hour, t);
    O.drawLift(g, lift.open);
    const cats = [...everyone(), human];
    const items = O.FURNITURE.map(f => ({ z: f.z, f }));
    for (const c of cats) items.push({ z: c.y + TILE, c });
    // 상자 속 고양이: 상자 앞면이 고양이 몸을 가린다
    if (surprise && surprise.kind === 'box') {
      const [bx, by] = surprise.at;
      items.push({ z: by * TILE - 1, box: 'back', bx, by });
      items.push({ z: (by + 1) * TILE + 0.5, box: 'front', bx, by });
    }
    items.sort((a, b) => a.z - b.z);
    for (const it of items) {
      if (it.f) O.drawFurniture(g, it.f, t, world);
      else if (it.box) O.drawFurniture(g, { type: it.box === 'back' ? 'boxBack' : 'boxFront', x: it.bx, y: it.by, w: 1, h: 1 }, t, world);
      else drawCat(g, it.c, t);
    }
    drawEffects(g, t);
    drawLetters(g);
    if (opts.light !== false) drawLight(g, hour);
  }

  // 머리 위 글자: 말풍선(bubble)과 이름표 위치
  function uiOf(c) {
    const walking = c.path.length > 0;
    const tn = now();
    let b = c.bubble && tn < c.bubble.until ? c.bubble : null;
    if (!b && !walking && c.pose === 'sleep') b = { kind: 'zzz', text: 'z Z z' };
    if (!b && c.label) b = { kind: 'label', text: c.label };
    return {
      x: c.x + 8, y: c.y + (walking ? 0 : c.oy) + 1, alpha: c.alpha,
      crowd: !walking && ((!!meeting && meeting.people.has(c)) || (!!surprise && surprise.kind !== 'box' && surprise.people.has(c))),
      bubble: b ? { kind: b.kind, text: b.text } : null,
    };
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
    tickSurprise();
    autoIdle();
    tickIdle(claude);
  }

  // 일부러 깜짝 사건 하나 일으키기 (버튼 · 콘솔용)
  function surpriseNow(kind) {
    if (surprise) endSurprise(true);
    return startSurprise(kind || pick(['box', 'bird', 'laser']));
  }

  return {
    handle, reset, step, draw, uiOf, pet, champion, surpriseNow,
    get stats() { return stats; },
    get liftFloorShown() { return lift.open; },
    cats: () => [...everyone(), human],
    get surprise() { return surprise && { kind: surprise.kind, people: [...surprise.people].map(p => p.id) }; },
    get meeting() { return meeting && { kind: meeting.kind }; },
    letters: () => letters.length,
    now,
  };
}

// 시간(0~24, 소수 허용)에 따른 바깥 하늘
export function skyOf(h) {
  if (h >= 6 && h < 7) return { top: '#f4b78a', bottom: '#f9dcb4', sun: '#ffd27a', sunY: 9 };
  if (h >= 7 && h < 17) return { top: '#79b8ff', bottom: '#b8dcff', sun: '#fff1a8', sunY: 6 };
  if (h >= 17 && h < 19) return { top: '#f28a5b', bottom: '#f7c56b', sun: '#ff9d4d', sunY: 9 };
  if (h >= 19 && h < 20) return { top: '#5b4a8a', bottom: '#c46a7a', stars: false, moon: true };
  if (h >= 5 && h < 6) return { top: '#3a4a7a', bottom: '#8a8ab8', moon: true };
  return { top: '#141a33', bottom: '#2a3358', stars: true, moon: true };
}

// 시간에 따른 사무실 조명: tint 는 전체에 덮는 색, lamps 는 책상 스탠드
export function lightOf(h) {
  if (h >= 7 && h < 17) return { tint: null, lamps: false, name: '낮' };
  if (h >= 17 && h < 19) return { tint: 'rgba(255,140,60,.12)', lamps: false, name: '노을' };
  if (h >= 19 && h < 21) return { tint: 'rgba(40,30,90,.28)', lamps: true, name: '저녁' };
  if (h >= 6 && h < 7) return { tint: 'rgba(255,170,120,.12)', lamps: false, name: '아침' };
  if (h >= 5 && h < 6) return { tint: 'rgba(30,40,90,.32)', lamps: true, name: '새벽' };
  return { tint: 'rgba(12,16,48,.45)', lamps: true, name: '밤' };
}
