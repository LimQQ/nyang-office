// Claude Code 세션이 시작될 때 SessionStart 훅이 부르는 스크립트.
// 냥냥 오피스 서버가 이미 떠 있으면 아무것도 하지 않고, 꺼져 있으면 백그라운드로 켠 뒤 브라우저를 한 번 연다.
//   node start-office.js             서버 켜기 + 브라우저 열기
//   node start-office.js --no-open   서버만 켜기
// 무슨 일이 있었는지는 office.log, 서버 자체의 출력·오류는 server.log 에 남는다.
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 4777;
const URL = `http://127.0.0.1:${PORT}`;
const LOG = path.join(__dirname, 'office.log');

function log(msg) {
  try { fs.appendFileSync(LOG, `${new Date().toLocaleString('sv-SE')}  ${msg}\n`); } catch {}
}

function isRunning() {
  return new Promise(resolve => {
    const sock = net.connect(PORT, '127.0.0.1');
    sock.setTimeout(500);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
    sock.once('error', () => resolve(false));
  });
}

// 훅이 끝나도 살아남도록 부모와 끊어서 띄운다.
function detached(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true, ...opts });
  child.on('error', e => log(`실행 실패 ${cmd}: ${e.message}`));
  child.unref();
  return child;
}

function openBrowser(url) {
  if (process.platform === 'win32') detached('cmd', ['/c', 'start', '', url]);
  else detached(process.platform === 'darwin' ? 'open' : 'xdg-open', [url]);
}

(async () => {
  if (await isRunning()) { log('이미 켜져 있음'); return; }
  const out = fs.openSync(path.join(__dirname, 'server.log'), 'a');
  const server = detached(process.execPath, [path.join(__dirname, 'server.js')], { cwd: __dirname, stdio: ['ignore', out, out] });
  log(`서버 시작 pid=${server.pid}`);
  let up = false;
  for (let i = 0; i < 20 && !(up = await isRunning()); i++) await new Promise(r => setTimeout(r, 150));
  if (!up) { log('3초 안에 서버가 응답하지 않음 — server.log 확인'); return; }
  if (process.argv.includes('--no-open')) return;
  openBrowser(URL);
  log('브라우저 열기');
})().catch(e => log(`오류: ${e.stack || e}`));
