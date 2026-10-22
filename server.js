// 냥냥 오피스 — Claude Code 세션 기록(jsonl)을 따라 읽어 도트 고양이 사무실로 중계하는 로컬 서버.
// 훅·설정은 건드리지 않고, 의존성도 없다. 127.0.0.1 에서만 열린다.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT) || 4777;
const HOST = '127.0.0.1';
const PROJECTS = process.env.CLAUDE_PROJECTS || path.join(os.homedir(), '.claude', 'projects');
const PUBLIC = path.join(__dirname, 'public');
// 데스크톱 앱이 세션마다 사이드바 이름(title)과 Claude Code 기록 ID(cliSessionId)를 적어 두는 곳
const APP_SESSIONS = process.env.CLAUDE_APP_SESSIONS || path.join(
  process.platform === 'win32' ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support')
      : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
  'Claude', 'claude-code-sessions');
const TAIL_MS = 250;
const INDEX_MS = 2000;
const SNAPSHOT_BYTES = 512 * 1024;
const SESSIONS_PER_FLOOR = 10;

// ───────────────────────── 텍스트 도우미 ─────────────────────────

function oneLine(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(c => (typeof c === 'string' ? c : c && c.type === 'text' ? c.text : '')).join(' ');
}

// 시스템이 끼워 넣은 메시지(<system-reminder>, <command-name>, [Request interrupted…])는 사람이 쓴 말이 아니다.
const isHumanText = t => !!t && !/^\s*[<\[]/.test(t);

const base = p => (p ? String(p).split(/[\\/]/).filter(Boolean).pop() : '');

function toolLabel(name, input) {
  const i = input || {};
  switch (name) {
    case 'Read': case 'NotebookRead': return '📖 ' + base(i.file_path || i.notebook_path);
    case 'Edit': case 'MultiEdit': case 'Write': case 'NotebookEdit': return '⌨️ ' + base(i.file_path || i.notebook_path);
    case 'Glob': case 'Grep': return '🔎 ' + oneLine(i.pattern, 28);
    case 'Bash': case 'PowerShell': return '$ ' + oneLine(i.command, 34);
    case 'WebSearch': return '🌐 ' + oneLine(i.query, 30);
    case 'WebFetch': try { return '🌐 ' + new URL(i.url).hostname; } catch { return '🌐 웹 페이지'; }
    case 'TodoWrite': return '🗒️ 할 일 정리';
    case 'EnterPlanMode': return '🗒️ 계획 세우는 중';
    case 'ExitPlanMode': return '🙋 계획 봐주세요';
    case 'AskUserQuestion': return '❓ ' + oneLine(i.questions && i.questions[0] && i.questions[0].question, 34);
    case 'Agent': case 'Task': return '📞 ' + (i.subagent_type || 'general-purpose') + ' 호출';
    case 'Skill': return '📘 ' + oneLine(i.skill, 24);
  }
  if (name.startsWith('mcp__')) return '🔌 ' + oneLine(name.split('__').pop(), 26);
  return '🔧 ' + name;
}

function todosOf(name, input) {
  const list = (name === 'TodoWrite' && input.todos) || (/update_plan$/.test(name) && input.items) || null;
  if (!Array.isArray(list)) return null;
  return list.slice(0, 8).map(x => ({ t: oneLine(x.content || x.subject || '', 30), s: x.status || 'pending' }));
}

// jsonl 한 줄 → 화면이 알아들을 이벤트 목록. a 는 'main' 또는 서브에이전트 키.
function entryEvents(o, a) {
  const out = [];
  const msg = o.message;
  if (!msg) return out;
  if (o.type === 'assistant' && Array.isArray(msg.content)) {
    for (const b of msg.content) {
      if (b.type === 'thinking') out.push({ k: 'think', a, text: oneLine(b.thinking, 90) });
      else if (b.type === 'text' && b.text && b.text.trim()) out.push({ k: 'say', a, text: oneLine(b.text, 90) });
      else if (b.type === 'tool_use') out.push({ k: 'tool', a, id: b.id, tool: b.name, label: toolLabel(b.name, b.input), input: b.input || {} });
    }
    if (msg.stop_reason === 'end_turn') out.push({ k: 'end', a });
  } else if (o.type === 'user' && !o.isMeta) {
    const c = msg.content;
    if (typeof c === 'string') {
      if (a === 'main' && isHumanText(c)) out.push({ k: 'prompt', a, text: oneLine(c, 90) });
    } else if (Array.isArray(c)) {
      for (const b of c) {
        if (b.type === 'tool_result') out.push({ k: 'result', a, id: b.tool_use_id, err: !!b.is_error, text: b.is_error ? oneLine(textOf(b.content), 70) : '' });
        else if (b.type === 'text' && a === 'main' && isHumanText(b.text)) out.push({ k: 'prompt', a, text: oneLine(b.text, 90) });
      }
    }
  }
  const at = Date.parse(o.timestamp) || Date.now();
  for (const e of out) e.at = at;
  return out;
}

// ───────────────────────── 파일 꼬리 읽기 ─────────────────────────

function readRange(file, start, len) {
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(file, 'r');
  try { return buf.subarray(0, fs.readSync(fd, buf, 0, len, start)); } finally { fs.closeSync(fd); }
}

// t = { file, offset, rest(Buffer) }. 새로 붙은 완성된 줄만 JSON 으로 돌려준다.
// 덜 써진 마지막 줄은 바이트 그대로 남겨 둬야 한글이 경계에서 깨지지 않는다.
function readAppended(t) {
  let st;
  try { st = fs.statSync(t.file); } catch { return []; }
  if (st.size < t.offset) { t.offset = 0; t.rest = Buffer.alloc(0); }
  if (st.size === t.offset) return [];
  const chunk = readRange(t.file, t.offset, Math.min(st.size - t.offset, 16 * 1024 * 1024));
  t.offset += chunk.length;
  const buf = t.rest.length ? Buffer.concat([t.rest, chunk]) : chunk;
  const cut = buf.lastIndexOf(0x0a);
  if (cut < 0) { t.rest = buf; return []; }
  t.rest = buf.subarray(cut + 1);
  return parseLines(buf.toString('utf8', 0, cut));
}

function parseLines(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* 깨진 줄은 건너뛴다 */ }
  }
  return out;
}

// 파일 끝 쪽 bytes 만큼만 읽어 과거 상태를 복원할 때 쓴다(첫 줄은 잘렸을 수 있어 버린다).
function readTail(file, bytes) {
  const size = fs.statSync(file).size;
  const start = Math.max(0, size - bytes);
  const buf = readRange(file, start, size - start);
  const from = start > 0 ? buf.indexOf(0x0a) + 1 : 0;
  const cut = buf.lastIndexOf(0x0a);
  if (cut < 0) return { size: start, entries: [] };
  return { size: start + cut + 1, entries: from <= cut ? parseLines(buf.toString('utf8', from, cut)) : [] };
}

function firstPrompt(file) {
  try {
    for (const o of parseLines(readRange(file, 0, 64 * 1024).toString('utf8'))) {
      if (o.type === 'user' && o.message) {
        const t = textOf(o.message.content);
        if (t) return t;
      }
    }
  } catch {}
  return '';
}

function metaType(file) {
  try {
    const m = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
    return m.agentType || m.subagent_type || m.subagentType || m.type || null;
  } catch { return null; }
}

const norm = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 120);

// ───────────────────────── 층별 안내(프로젝트·세션 목록) ─────────────────────────

const metaCache = new Map(); // file → { size, cwd, title }

function sessionMeta(file, size) {
  const hit = metaCache.get(file);
  if (hit && (hit.title || hit.size === size)) return hit;
  const m = { size, cwd: hit && hit.cwd, title: null };
  let entries = [];
  try { entries = parseLines(readRange(file, 0, 128 * 1024).toString('utf8')); } catch {}
  for (const o of entries) {
    if (!m.cwd && o.cwd) m.cwd = o.cwd;
    if (!m.title && o.type === 'user' && !o.isMeta && !o.isSidechain && o.message) {
      const t = textOf(o.message.content);
      if (isHumanText(t)) m.title = oneLine(t, 40);
    }
    if (m.cwd && m.title) break;
  }
  metaCache.set(file, m);
  return m;
}

// cliSessionId → { 앱 사이드바 이름, 지금 작업 폴더 }. 앱 세션 파일(…/local_*.json)은 바뀐 것만 다시 읽는다.
const appFiles = new Map(); // 파일 → { mtime, cli, title }

function appTitles() {
  const titles = new Map();
  const seen = new Set();
  const dirs = d => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };
  for (const org of dirs(APP_SESSIONS)) {
    if (!org.isDirectory()) continue;
    for (const acct of dirs(path.join(APP_SESSIONS, org.name))) {
      if (!acct.isDirectory()) continue;
      const dir = path.join(APP_SESSIONS, org.name, acct.name);
      for (const f of dirs(dir)) {
        if (!/^local_.*\.json$/.test(f.name)) continue;
        const file = path.join(dir, f.name);
        seen.add(file);
        let hit = appFiles.get(file);
        try {
          const mtime = fs.statSync(file).mtimeMs;
          if (!hit || hit.mtime !== mtime) {
            const o = JSON.parse(fs.readFileSync(file, 'utf8'));
            hit = { mtime, cli: o.cliSessionId, title: typeof o.title === 'string' ? o.title.trim() : '', cwd: o.cwd || null };
            appFiles.set(file, hit);
          }
        } catch { continue; }
        if (hit.cli && hit.title) titles.set(hit.cli, hit);
      }
    }
  }
  for (const file of appFiles.keys()) if (!seen.has(file)) appFiles.delete(file);
  return titles;
}

let index = { floors: [], at: 0 };

function buildIndex() {
  const floors = [];
  const named = appTitles();
  let dirs = [];
  try { dirs = fs.readdirSync(PROJECTS, { withFileTypes: true }).filter(d => d.isDirectory()); } catch {}
  for (const d of dirs) {
    const dir = path.join(PROJECTS, d.name);
    let sessions = [];
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.jsonl')) continue;
        const st = fs.statSync(path.join(dir, f));
        sessions.push({ id: f.slice(0, -6), mtime: st.mtimeMs, size: st.size });
      }
    } catch { continue; }
    if (!sessions.length) continue;
    sessions.sort((x, y) => y.mtime - x.mtime);
    sessions = sessions.slice(0, SESSIONS_PER_FLOOR).map(s => {
      const m = sessionMeta(path.join(dir, s.id + '.jsonl'), s.size);
      const app = named.get(s.id);
      // 앱이 아는 작업 폴더가 더 정확하다(세션을 다른 폴더로 옮기면 기록 맨 앞의 cwd 는 옛 폴더로 남는다)
      return { id: s.id, mtime: s.mtime, title: (app && app.title) || m.title, appTitle: app && app.title, cwd: (app && app.cwd) || m.cwd };
    });
    const cwd = (sessions.find(s => s.cwd) || {}).cwd || null;
    const folder = cwd ? base(cwd) : d.name;
    // 층 이름은 그 층에서 가장 최근에 움직인 세션의 앱 이름. 앱을 안 쓴 프로젝트는 폴더 이름.
    const latestNamed = sessions.find(s => s.appTitle);
    let born = 0;
    try { born = fs.statSync(dir).birthtimeMs; } catch {}
    floors.push({ key: d.name, name: latestNamed ? latestNamed.appTitle : folder, dir: folder, cwd, born, mtime: sessions[0].mtime, sessions: sessions.map(({ id, mtime, title }) => ({ id, mtime, title })) });
  }
  // 먼저 생긴 프로젝트가 아래층. 층 번호가 매번 바뀌지 않도록 생성 시각으로 정렬한다.
  floors.sort((x, y) => x.born - y.born || x.key.localeCompare(y.key));
  floors.forEach((f, i) => { f.floor = i + 1; delete f.born; });
  index = { floors, at: Date.now() };
}

// ───────────────────────── 세션 하나를 따라 읽는 꼬리 ─────────────────────────

class SessionTail {
  constructor(floorKey, sessionId) {
    this.key = floorKey + '/' + sessionId;
    this.dir = path.join(PROJECTS, floorKey);
    this.file = path.join(this.dir, sessionId + '.jsonl');
    this.subDir = path.join(this.dir, sessionId, 'subagents');
    this.clients = new Set();
    this.main = { file: this.file, offset: 0, rest: Buffer.alloc(0) };
    this.subFiles = new Map(); // 파일명 → { file, offset, rest, key }
    this.agents = new Map();   // 키(Agent tool_use id 또는 'sa:'+agentId) → 상태
    this.pending = [];         // 아직 기록 파일과 짝지어지지 않은 Agent 호출
    this.mainState = { status: 'idle', tool: null, label: '', at: 0 };
    this.todos = [];
    this.ticks = 0;
    this.bootstrap();
  }

  bootstrap() {
    try {
      const { size, entries } = readTail(this.file, SNAPSHOT_BYTES);
      this.main.offset = size;
      for (const o of entries) if (!o.isSidechain) for (const ev of entryEvents(o, 'main')) this.apply(ev, false);
    } catch {}
    this.scanSubagents(false);
    this.checkDone(false);
  }

  who(a) { return a === 'main' ? this.mainState : this.agents.get(a); }

  apply(ev, emit) {
    const w = this.who(ev.a);
    if (!w) return;
    if (ev.a !== 'main' && w.done) this.revive(w, emit);
    w.at = ev.at || Date.now();
    w.last = ev.k;
    if (ev.k === 'tool') {
      w.status = 'work'; w.tool = ev.tool; w.label = ev.label;
      const todos = todosOf(ev.tool, ev.input);
      if (todos) { this.todos = todos; if (emit) this.send('ev', { k: 'todos', a: ev.a, items: todos }); }
      if (ev.a === 'main' && (ev.tool === 'Agent' || ev.tool === 'Task')) this.spawn(ev, emit);
    } else if (ev.k === 'result') {
      const ag = ev.a === 'main' && this.agents.get(ev.id);
      if (ag) ag.resultAt = ev.at || Date.now();
    } else if (ev.k === 'end') {
      w.status = 'idle';
    } else if (ev.k === 'prompt') {
      w.status = 'listen';
    }
    if (emit) {
      const { input, ...pub } = ev;
      this.send('ev', pub);
    }
  }

  spawn(ev, emit) {
    const i = ev.input || {};
    const ag = {
      key: ev.id, type: i.subagent_type || 'general-purpose', desc: oneLine(i.description, 40),
      prompt: norm(i.prompt), status: 'arrive', tool: null, label: '', at: ev.at, last: 'spawn',
      file: null, resultAt: 0, done: false,
    };
    this.agents.set(ag.key, ag);
    this.pending.push(ag);
    if (emit) this.send('ev', { k: 'spawn', a: ag.key, type: ag.type, desc: ag.desc, at: ag.at });
  }

  revive(ag, emit) {
    ag.done = false;
    if (emit) this.send('ev', { k: 'spawn', a: ag.key, type: ag.type, desc: ag.desc, revive: true, at: Date.now() });
  }

  finish(ag, emit) {
    if (ag.done) return;
    ag.done = true;
    ag.status = 'gone';
    if (emit) this.send('ev', { k: 'done', a: ag.key, desc: ag.desc, at: Date.now() });
  }

  scanSubagents(emit) {
    let names;
    try { names = fs.readdirSync(this.subDir); } catch { return; }
    for (const n of names) {
      if (!n.endsWith('.jsonl') || this.subFiles.has(n)) continue;
      const file = path.join(this.subDir, n);
      let st;
      try { st = fs.statSync(file); } catch { continue; }
      const sf = { file, offset: 0, rest: Buffer.alloc(0), key: null };
      this.subFiles.set(n, sf);
      const fresh = Date.now() - st.mtimeMs < 60 * 1000;
      const prompt = norm(firstPrompt(file));
      let ag = this.pending.find(p => p.prompt && prompt && (prompt.startsWith(p.prompt.slice(0, 80)) || p.prompt.startsWith(prompt.slice(0, 80))));
      if (!ag && emit && fresh) ag = this.pending[0]; // 프롬프트로 못 찾으면 먼저 부른 순서대로
      if (ag) {
        this.pending.splice(this.pending.indexOf(ag), 1);
        const t = metaType(file);
        if (t) ag.type = t;
      } else {
        // 기록 앞부분이 잘려 Agent 호출을 못 본 경우: 파일만으로 서브에이전트를 만든다.
        const agentId = n.replace(/^agent-/, '').replace(/\.jsonl$/, '');
        ag = { key: 'sa:' + agentId, type: metaType(file) || 'general-purpose', desc: '', prompt, status: 'arrive', tool: null, label: '', at: st.mtimeMs, last: 'spawn', file: null, resultAt: 0, done: !fresh };
        this.agents.set(ag.key, ag);
        if (fresh && emit) this.send('ev', { k: 'spawn', a: ag.key, type: ag.type, desc: '', at: Date.now() });
      }
      sf.key = ag.key;
      ag.file = file;
      if (ag.done) { sf.offset = st.size; continue; }
      if (!emit) {
        try {
          const { size, entries } = readTail(file, 256 * 1024);
          sf.offset = size;
          for (const o of entries) for (const ev of entryEvents(o, ag.key)) this.apply(ev, false);
        } catch {}
      }
    }
  }

  checkDone(emit) {
    const now = Date.now();
    for (const ag of this.agents.values()) {
      if (ag.done) continue;
      const quiet = now - (ag.at || now);
      const saidLast = ag.last === 'say' || ag.last === 'end';
      if ((ag.file && saidLast && quiet > 3000) ||
          (!ag.file && ag.resultAt && now - ag.resultAt > 5000) ||
          quiet > 3 * 60 * 1000) this.finish(ag, emit);
    }
  }

  step() {
    for (const o of readAppended(this.main)) if (!o.isSidechain) for (const ev of entryEvents(o, 'main')) this.apply(ev, true);
    if (++this.ticks % 4 === 0) this.scanSubagents(true);
    for (const sf of this.subFiles.values()) {
      if (!sf.key) continue;
      for (const o of readAppended(sf)) for (const ev of entryEvents(o, sf.key)) this.apply(ev, true);
    }
    this.checkDone(true);
  }

  snapshot() {
    const now = Date.now();
    const m = this.mainState;
    return {
      key: this.key,
      main: { status: m.status, tool: m.tool, label: m.label, quietMs: now - (m.at || 0) },
      agents: [...this.agents.values()].filter(a => !a.done).map(a => ({ a: a.key, type: a.type, desc: a.desc, tool: a.tool, label: a.label, status: a.status })),
      todos: this.todos,
    };
  }

  send(type, data) {
    const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.clients) res.write(msg);
  }
}

const tails = new Map();

function tailFor(floorKey, sessionId) {
  const key = floorKey + '/' + sessionId;
  let t = tails.get(key);
  if (!t) { t = new SessionTail(floorKey, sessionId); tails.set(key, t); }
  clearTimeout(t.reaper);
  return t;
}

setInterval(() => { for (const t of tails.values()) if (t.clients.size) t.step(); }, TAIL_MS);

// ───────────────────────── HTTP ─────────────────────────

const allClients = new Set(); // { res, lastIndex }

function pushIndex() {
  buildIndex();
  const body = JSON.stringify(index.floors);
  for (const c of allClients) {
    if (c.lastIndex === body) continue;
    c.lastIndex = body;
    c.res.write(`event: index\ndata: ${body}\n\n`);
  }
}
setInterval(pushIndex, INDEX_MS);
setInterval(() => { for (const c of allClients) c.res.write(': ping\n\n'); }, 15000);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const file = path.resolve(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

function openEvents(req, res, sel) {
  const m = /^([^/\\]+)\/([\w-]+)$/.exec(sel || '');
  if (!m || m[1] === '..' || m[1] === '.' || !fs.existsSync(path.join(PROJECTS, m[1], m[2] + '.jsonl'))) {
    res.writeHead(404).end('no such session');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  const t = tailFor(m[1], m[2]);
  const client = { res, lastIndex: JSON.stringify(index.floors) };
  res.write(`event: index\ndata: ${client.lastIndex}\n\n`);
  res.write(`event: snapshot\ndata: ${JSON.stringify(t.snapshot())}\n\n`);
  t.clients.add(res);
  allClients.add(client);
  req.on('close', () => {
    t.clients.delete(res);
    allClients.delete(client);
    if (!t.clients.size) t.reaper = setTimeout(() => tails.delete(t.key), 10000);
  });
}

buildIndex();

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);
  if (url.pathname === '/api/index') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(index.floors));
  } else if (url.pathname === '/events') {
    openEvents(req, res, url.searchParams.get('s'));
  } else {
    serveStatic(req, res, url.pathname);
  }
}).on('error', err => {
  // 세션 두 개가 동시에 시작돼 서버가 겹쳐 뜨면, 늦게 뜬 쪽이 조용히 물러난다.
  if (err.code !== 'EADDRINUSE') throw err;
  console.log(`🐾 이미 ${PORT}번 포트에서 사무실이 열려 있어요: http://${HOST}:${PORT}`);
  process.exit(0);
}).listen(PORT, HOST, () => {
  console.log(`🐾 냥냥 오피스 개장: http://${HOST}:${PORT}`);
  console.log(`   기록 폴더: ${PROJECTS}  (층 ${index.floors.length}개)`);
  console.log(`   데모 보기: http://${HOST}:${PORT}/?demo`);
});
