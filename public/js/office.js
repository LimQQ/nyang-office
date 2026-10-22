// 사무실 한 층: 32×20 칸 지도, 방·가구·자리, 길찾기, 배경 그리기.
export const TILE = 16, W = 32, H = 20;
export const PW = W * TILE, PH = H * TILE;

export const ROOMS = {
  library: { name: '자료실', emoji: '📚', x0: 1, y0: 1, x1: 8, y1: 7 },
  dev:     { name: '개발실', emoji: '💻', x0: 13, y0: 1, x1: 21, y1: 7 },
  server:  { name: '서버실', emoji: '🗄️', x0: 23, y0: 1, x1: 30, y1: 7 },
  hall:    { name: '복도', x0: 1, y0: 9, x1: 30, y1: 11 },
  web:     { name: '정보검색실', emoji: '🌐', x0: 1, y0: 13, x1: 9, y1: 18 },
  meeting: { name: '회의실', emoji: '🗒️', x0: 11, y0: 13, x1: 20, y1: 18 },
  boss:    { name: '집사 자리', emoji: '🧑‍💻', x0: 22, y0: 13, x1: 30, y1: 18 },
};

const DOORS = [[4, 8], [5, 8], [17, 8], [18, 8], [26, 8], [27, 8], [8, 12], [9, 12], [18, 12], [19, 12], [28, 12], [29, 12]];
export const LIFT_DOORS = [[10, 8], [11, 8]]; // 엘리베이터 문(벽 속), 바로 아래 칸이 타는 곳

// 자리: [x, y, 바라보는 방향, 세로 보정(px)]. x 가 .5 면 두 칸 사이 가운데.
// 방마다 한 마리씩 상주하는 담당 고양이의 자리
export const DESKS = {
  library: [4.5, 4, 'down', 0],
  dev:     [17.5, 2, 'up', -4],
  server:  [26.5, 3, 'up', -4],
  web:     [4.5, 16, 'up', -4],
  meeting: [14, 14, 'up', -4],
};
export const SPOTS = {
  home: [[15, 4, 'down', 0]],                // Claude 팀장 책상
  nap:  [[20, 6, 'down', -2]],               // 낮잠 상자
  seat: [[14, 18, 'up', -3], [16, 18, 'up', -3], [12, 16, 'right', 0], [18, 16, 'left', 0], [12, 17, 'right', 0], [18, 17, 'left', 0]], // 서브에이전트가 앉는 회의 테이블
  meet: [[15, 15, 'down', 0], [13, 15, 'down', 0], [14, 15, 'down', 0], [16, 15, 'down', 0], [17, 15, 'down', 0], [13, 18, 'up', -3], [15, 18, 'up', -3], [17, 18, 'up', -3]], // 회의 자리(첫 칸은 Claude 상석)
};
export const HUMAN_AT = [25, 14];
export const WHITEBOARD = { x: 12, y: 13, w: 5 };

// act: 그 방 담당 고양이가 일하는 동안 화면이 켜진다(방 이름).
export const FURNITURE = [
  { type: 'shelf', x: 1, y: 1, w: 3, h: 2 },
  { type: 'cabinet', x: 4, y: 1, w: 2, h: 1 },
  { type: 'shelf', x: 6, y: 1, w: 3, h: 2 },
  { type: 'table', x: 3, y: 6, w: 4, h: 1 },
  { type: 'plant', x: 8, y: 7, w: 1, h: 1 },
  { type: 'plant', x: 1, y: 7, w: 1, h: 1 },

  { type: 'desk', x: 14, y: 1, w: 2, h: 1, pc: 'imac' },
  { type: 'desk', x: 17, y: 1, w: 2, h: 1, pc: 'imac', act: 'dev' },
  { type: 'desk', x: 20, y: 1, w: 2, h: 1, pc: 'imac' },
  { type: 'desk', x: 14, y: 5, w: 3, h: 1, home: true },
  { type: 'plant', x: 13, y: 7, w: 1, h: 1 },
  { type: 'boxBack', x: 20, y: 6, w: 1, h: 1, walk: true },
  { type: 'boxFront', x: 20, y: 6, w: 1, h: 1, walk: true, zAdd: 0.5 },

  { type: 'rack', x: 23, y: 1, w: 2, h: 2 },
  { type: 'rack', x: 26, y: 1, w: 2, h: 2 },
  { type: 'rack', x: 29, y: 1, w: 2, h: 2 },
  { type: 'console', x: 23, y: 6, w: 3, h: 1 },
  { type: 'aircon', x: 30, y: 6, w: 1, h: 2 },

  { type: 'desk', x: 1, y: 15, w: 2, h: 1, pc: 'globe' },
  { type: 'desk', x: 4, y: 15, w: 2, h: 1, pc: 'globe', act: 'web' },
  { type: 'desk', x: 7, y: 15, w: 2, h: 1, pc: 'globe' },
  { type: 'globe', x: 1, y: 18, w: 1, h: 1 },
  { type: 'plant', x: 9, y: 18, w: 1, h: 1 },

  { type: 'whiteboard', x: 12, y: 13, w: 5, h: 1 },
  { type: 'mtable', x: 13, y: 16, w: 5, h: 2 },
  { type: 'plant', x: 11, y: 18, w: 1, h: 1 },
  { type: 'plant', x: 20, y: 13, w: 1, h: 1 },

  { type: 'bossdesk', x: 24, y: 15, w: 3, h: 1 },
  { type: 'sofa', x: 28, y: 18, w: 2, h: 1 },
  { type: 'cattower', x: 22, y: 17, w: 1, h: 2 },
  { type: 'plant', x: 30, y: 13, w: 1, h: 1 },

  { type: 'plant', x: 1, y: 9, w: 1, h: 1 },
  { type: 'plant', x: 30, y: 11, w: 1, h: 1 },
  { type: 'bench', x: 20, y: 9, w: 3, h: 1 },
];
for (const f of FURNITURE) f.z = (f.y + f.h) * TILE + (f.zAdd || 0) - (f.type === 'boxBack' ? TILE - 1 : 0);

// ───────────────────────── 지도와 길찾기 ─────────────────────────

const FLOOR = 0, WALL = 1, LIFT = 2;
const grid = Array.from({ length: H }, () => new Array(W).fill(WALL));
for (const r of Object.values(ROOMS)) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) grid[y][x] = FLOOR;
for (const [x, y] of DOORS) grid[y][x] = FLOOR;
for (const [x, y] of LIFT_DOORS) grid[y][x] = LIFT;

const blocked = new Uint8Array(W * H);
for (const f of FURNITURE) if (!f.walk) for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) blocked[y * W + x] = 1;
blocked[HUMAN_AT[1] * W + HUMAN_AT[0]] = 1;

export function walkable(x, y) {
  return x >= 0 && y >= 0 && x < W && y < H && grid[y][x] === FLOOR && !blocked[y * W + x];
}

export function roomAt(x, y) {
  for (const [id, r] of Object.entries(ROOMS)) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return id;
  return 'hall';
}

// 4방향 BFS. 출발 칸은 빼고 도착 칸까지의 칸 목록을 돌려준다(못 가면 빈 배열).
export function findPath(sx, sy, tx, ty) {
  if (sx === tx && sy === ty) return [];
  const prev = new Int32Array(W * H).fill(-1);
  const start = sy * W + sx, goal = ty * W + tx;
  prev[start] = start;
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    if (cur === goal) break;
    const cx = cur % W, cy = (cur - cx) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, n = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev[n] !== -1) continue;
      if (n !== goal && !walkable(nx, ny)) continue;
      prev[n] = cur;
      q.push(n);
    }
  }
  if (prev[goal] === -1) return [];
  const out = [];
  for (let c = goal; c !== start; c = prev[c]) out.push([c % W, Math.floor(c / W)]);
  return out.reverse();
}

// 출발 칸에서 가까운 순서로, 조건을 만족하는 빈 칸 하나.
export function nearestFree(sx, sy, ok) {
  const seen = new Uint8Array(W * H);
  const q = [[sx, sy]];
  seen[sy * W + sx] = 1;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    if (i > 0 && walkable(x, y) && ok(x, y)) return [x, y];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx]) continue;
      seen[ny * W + nx] = 1;
      if (walkable(nx, ny)) q.push([nx, ny]);
    }
  }
  return [sx, sy];
}

// ───────────────────────── 그리기 도우미 ─────────────────────────

const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const hash = (a, b, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const BOOKS = ['#c0504d', '#4f81bd', '#9bbb59', '#f2c94c', '#8064a2', '#4bacc6', '#f79646', '#e8e2d0'];

const FLOORS = {
  library: (g, X, Y, x, y) => { rect(g, X, Y, 16, 16, '#c9a57c'); for (let i = 0; i < 4; i++) rect(g, X, Y + i * 4 + 3, 16, 1, '#b8946c'); rect(g, X + ((y * 5 + x * 3) % 4) * 4, Y, 1, 16, '#b8946c'); },
  dev: (g, X, Y) => { rect(g, X, Y, 16, 16, '#dfe3e8'); rect(g, X, Y, 16, 1, '#cfd5dc'); rect(g, X, Y, 1, 16, '#cfd5dc'); },
  server: (g, X, Y) => { rect(g, X, Y, 16, 16, '#59616e'); rect(g, X, Y, 16, 1, '#4c535f'); rect(g, X, Y, 1, 16, '#4c535f'); rect(g, X + 5, Y + 5, 6, 6, '#525a67'); },
  web: (g, X, Y, x, y) => { rect(g, X, Y, 16, 16, '#a6c6e6'); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j + x + y) % 2 === 0) rect(g, X + i * 4 + 1, Y + j * 4 + 1, 1, 1, '#93b7dc'); },
  meeting: (g, X, Y) => { rect(g, X, Y, 16, 16, '#e8dcc0'); rect(g, X, Y + 15, 16, 1, '#dccfb0'); rect(g, X + 15, Y, 1, 16, '#dccfb0'); },
  boss: (g, X, Y, x, y) => { rect(g, X, Y, 16, 16, '#b98d62'); for (let i = 0; i < 4; i++) rect(g, X, Y + i * 4 + 3, 16, 1, '#a87d54'); rect(g, X + ((y * 7 + x) % 4) * 4 + 2, Y, 1, 16, '#a87d54'); },
  hall: (g, X, Y, x, y) => { rect(g, X, Y, 16, 16, (x + y) % 2 ? '#efe9dd' : '#e6dfd0'); },
};

// 바닥·벽·엘리베이터 통로처럼 움직이지 않는 것은 한 번만 그려 둔다.
export function paintBackground(g) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = x * TILE, Y = y * TILE;
    if (grid[y][x] === FLOOR) {
      (FLOORS[roomAt(x, y)] || FLOORS.hall)(g, X, Y, x, y);
      if (DOORS.some(([dx, dy]) => dx === x && dy === y)) { FLOORS.hall(g, X, Y, x, y); rect(g, X + 1, Y + 4, 14, 8, '#b5a48f'); rect(g, X + 2, Y + 5, 12, 6, '#c8b8a2'); }
      continue;
    }
    const below = y + 1 < H ? grid[y + 1][x] : WALL;
    if (below === FLOOR || below === LIFT) {
      rect(g, X, Y, 16, 5, '#6b5a4f');
      rect(g, X, Y + 5, 16, 11, '#d3c4b2');
      rect(g, X, Y + 5, 16, 1, '#e2d6c6');
      rect(g, X, Y + 14, 16, 2, '#a8957f');
    } else {
      rect(g, X, Y, 16, 16, '#6b5a4f');
      rect(g, X, Y, 16, 1, '#7d6b5f');
    }
  }
  // 엘리베이터 통로(자료실과 개발실 사이)
  rect(g, 9 * TILE, 0, 4 * TILE, 8 * TILE + 5, '#7e858d');
  rect(g, 9 * TILE + 2, 2, 4 * TILE - 4, 8 * TILE - 2, '#949ba3');
  for (let y = 8; y < 120; y += 14) { rect(g, 9 * TILE + 4, y, 1, 1, '#6c737b'); rect(g, 13 * TILE - 5, y, 1, 1, '#6c737b'); }
  rect(g, 9 * TILE + 18, 40, 28, 12, '#5f666e'); // EV 표지판 자리(글자는 화면 위에)
  // 정보검색실 벽의 세계지도
  rect(g, 2 * TILE + 2, 12 * TILE + 6, 54, 8, '#cfe6f7');
  for (const [x, y, w, h] of [[6, 7, 9, 3], [12, 9, 5, 4], [22, 7, 10, 4], [30, 10, 6, 3], [40, 7, 8, 5], [48, 11, 5, 2]]) rect(g, 2 * TILE + 2 + x, 12 * TILE + y, w, h, '#7cc47f');
  // 집사 자리 러그
  rect(g, 23 * TILE + 8, 15 * TILE + 8, 4 * TILE, 3 * TILE - 4, '#9e4a4a');
  rect(g, 23 * TILE + 10, 15 * TILE + 10, 4 * TILE - 4, 3 * TILE - 8, '#b65c5c');
}

// open: 0(닫힘) ~ 1(활짝)
export function drawLift(g, open) {
  const X = 10 * TILE, Y = 8 * TILE;
  rect(g, X - 2, Y, 36, 16, '#6f7780');
  rect(g, X + 1, Y + 2, 30, 14, '#262b33');
  const half = Math.round(15 * (1 - open));
  rect(g, X + 1, Y + 2, half, 14, '#b9c3cd');
  rect(g, X + 31 - half, Y + 2, half, 14, '#b9c3cd');
  if (half > 1) { rect(g, X + half, Y + 2, 1, 14, '#8d97a1'); rect(g, X + 31 - half, Y + 2, 1, 14, '#8d97a1'); rect(g, X + 2, Y + 3, 1, 12, '#d7dee5'); }
  rect(g, X + 6, Y - 9, 20, 7, '#1b1f24'); // 층 표시창
}

function drawPlant(g, X, Y) {
  rect(g, X + 4, Y + 9, 8, 6, '#c46a45'); rect(g, X + 4, Y + 9, 8, 1, '#d98060'); rect(g, X + 5, Y + 15, 6, 1, '#9c5236');
  rect(g, X + 3, Y + 1, 10, 8, '#3d8b45'); rect(g, X + 5, Y - 2, 6, 5, '#58a55c'); rect(g, X + 1, Y + 4, 4, 4, '#58a55c'); rect(g, X + 11, Y + 3, 4, 4, '#4c9a51'); rect(g, X + 6, Y + 2, 2, 2, '#7cc47f');
}

function drawDesk(g, f, t, on) {
  const X = f.x * TILE + 1, Y = f.y * TILE - 4, Wd = f.w * TILE - 2;
  rect(g, X, Y, Wd, 8, '#b07f55'); rect(g, X, Y, Wd, 1, '#c99a6e');
  rect(g, X, Y + 8, Wd, 7, '#8a5f3d'); rect(g, X + 2, Y + 10, Wd - 4, 1, '#7a5233');
  rect(g, X + 1, Y + 15, 2, 5, '#6d4a30'); rect(g, X + Wd - 3, Y + 15, 2, 5, '#6d4a30');
  const cx = X + Math.floor(Wd / 2);
  if (f.pc === 'imac') {
    rect(g, cx - 8, Y - 12, 16, 12, '#dfe3e8'); rect(g, cx - 7, Y - 11, 14, 8, on ? '#1d2330' : '#2c3340');
    rect(g, cx - 1, Y, 2, 2, '#b8bec6'); rect(g, cx - 3, Y + 2, 6, 1, '#b8bec6'); rect(g, cx - 8, Y - 2, 16, 2, '#cfd5dc');
    if (on) { // 화면에 코드가 흐른다
      const COL = ['#7fd88f', '#f2c94c', '#79b8ff', '#ff8f8f', '#c792ea'];
      const s = Math.floor(t * 4);
      for (let i = 0; i < 4; i++) { const k = s + i; rect(g, cx - 6 + (k % 3), Y - 10 + i * 2, 3 + Math.floor(hash(k, f.x) * 8), 1, COL[k % COL.length]); }
    }
  } else if (f.pc === 'globe') {
    rect(g, cx - 7, Y - 11, 14, 11, '#3a3f47'); rect(g, cx - 6, Y - 10, 12, 8, on ? '#2f6db5' : '#2a3a52');
    rect(g, cx - 1, Y, 2, 2, '#3a3f47'); rect(g, cx - 3, Y + 1, 6, 1, '#3a3f47');
    if (on) { const sh = Math.floor(t * 3) % 6; rect(g, cx - 3, Y - 9, 6, 6, '#4f9be0'); rect(g, cx - 3 + (sh % 3), Y - 8, 2, 2, '#7cc47f'); rect(g, cx - 1 + ((sh + 2) % 3), Y - 6, 2, 2, '#7cc47f'); }
  }
  if (f.home) { // Claude 자리: 전화기·머그·명패
    rect(g, X + 3, Y + 1, 7, 4, '#d0504a'); rect(g, X + 4, Y, 5, 2, '#a83a35');
    rect(g, X + Wd - 8, Y + 1, 4, 5, '#f6f3ec'); rect(g, X + Wd - 4, Y + 2, 1, 2, '#f6f3ec'); rect(g, X + Wd - 8, Y + 1, 4, 1, '#7a4a2a');
    rect(g, cx - 6, Y + 9, 12, 4, '#d97757'); rect(g, cx - 5, Y + 10, 10, 2, '#f0a17f');
  }
}

function drawShelf(g, f) {
  const X = f.x * TILE, Y = f.y * TILE - 10, Wd = f.w * TILE, Hd = f.h * TILE + 8;
  rect(g, X, Y, Wd, Hd, '#6d4a30'); rect(g, X + 1, Y + 1, Wd - 2, Hd - 3, '#4a3020');
  const rows = Math.floor((Hd - 4) / 10);
  for (let r = 0; r < rows; r++) {
    const sy = Y + 2 + r * 10;
    for (let bx = X + 2, i = 0; bx < X + Wd - 3; i++) {
      const bw = 2 + Math.floor(hash(f.x, r, i) * 2), bh = 6 + Math.floor(hash(f.y, r, i + 7) * 3);
      rect(g, bx, sy + 8 - bh, bw, bh, BOOKS[Math.floor(hash(f.x + i, r) * BOOKS.length)]);
      bx += bw + (hash(i, r, f.x) > 0.85 ? 2 : 0);
    }
    rect(g, X + 1, sy + 8, Wd - 2, 2, '#8a5f3d');
  }
}

function drawRack(g, f, t, busy) {
  const X = f.x * TILE + 2, Y = f.y * TILE - 10, Wd = f.w * TILE - 4, Hd = f.h * TILE + 8;
  rect(g, X, Y, Wd, Hd, '#1e222b'); rect(g, X + 1, Y + 1, Wd - 2, Hd - 2, '#2f3542');
  const speed = busy ? 9 : 1.3;
  for (let u = 0; u < 7; u++) {
    const uy = Y + 3 + u * 5;
    rect(g, X + 2, uy, Wd - 4, 4, '#3d4453'); rect(g, X + 3, uy + 1, 10, 1, '#4b5364');
    for (let l = 0; l < 3; l++) {
      const on = (t * speed + hash(f.x, u, l) * 7) % 1 > 0.45;
      rect(g, X + Wd - 5 - l * 3, uy + 1, 2, 2, on ? ['#5ef08a', '#3ec0ff', '#ffb347'][l] : '#28303b');
    }
  }
}

function drawWhiteboard(g, f) {
  const X = f.x * TILE + 1, Y = f.y * TILE - 14, Wd = f.w * TILE - 2;
  rect(g, X + 4, Y + 24, 2, 8, '#8d97a1'); rect(g, X + Wd - 6, Y + 24, 2, 8, '#8d97a1');
  rect(g, X, Y, Wd, 25, '#9aa3ad'); rect(g, X + 1, Y + 1, Wd - 2, 22, '#fbfbf7');
  rect(g, X + 2, Y + 23, Wd - 4, 2, '#c3cad1'); rect(g, X + 8, Y + 22, 5, 1, '#d0504a'); rect(g, X + 14, Y + 22, 5, 1, '#4f81bd');
}

function drawBox(g, f, front) {
  const X = f.x * TILE, Y = f.y * TILE;
  if (!front) { rect(g, X + 1, Y + 3, 14, 12, '#8f6534'); rect(g, X + 2, Y + 4, 12, 6, '#6e4c26'); rect(g, X - 1, Y + 1, 4, 3, '#c99a5e'); rect(g, X + 13, Y + 1, 4, 3, '#c99a5e'); return; }
  rect(g, X + 1, Y + 10, 14, 6, '#c99a5e'); rect(g, X + 1, Y + 10, 14, 1, '#ddb57c'); rect(g, X + 6, Y + 12, 4, 2, '#b5864d');
}

function drawMeetingTable(g, f) {
  const X = f.x * TILE + 2, Y = f.y * TILE - 2, Wd = f.w * TILE - 4, Hd = f.h * TILE - 2;
  for (let i = 0; i < 3; i++) rect(g, X + 8 + i * 24, Y + Hd + 1, 10, 6, '#6a8caf');
  rect(g, X, Y, Wd, Hd - 6, '#b88a5e'); rect(g, X, Y, Wd, 1, '#cc9f72'); rect(g, X, Y + Hd - 6, Wd, 5, '#946a43');
  rect(g, X + 10, Y + 6, 8, 6, '#fbfbf7'); rect(g, X + 40, Y + 9, 8, 6, '#fbfbf7'); rect(g, X + 58, Y + 5, 4, 4, '#f6f3ec');
}

function drawBossDesk(g, f) {
  const X = f.x * TILE, Y = f.y * TILE - 4, Wd = f.w * TILE;
  rect(g, X, Y, Wd, 9, '#7a4f33'); rect(g, X, Y, Wd, 1, '#94643f');
  rect(g, X, Y + 9, Wd, 9, '#5e3b25'); rect(g, X + 3, Y + 11, Wd - 6, 1, '#6d4a30');
  rect(g, X + 4, Y - 6, 12, 7, '#4a5059'); rect(g, X + 5, Y - 5, 10, 5, '#5c636d'); // 모니터 뒷면
  rect(g, X + Wd - 9, Y + 1, 4, 5, '#f6f3ec'); rect(g, X + Wd - 5, Y + 2, 1, 2, '#f6f3ec');
  rect(g, X + 20, Y + 2, 10, 5, '#2f3542'); // 키보드
}

function drawSofa(g, f) {
  const X = f.x * TILE, Y = f.y * TILE - 4, Wd = f.w * TILE;
  rect(g, X, Y, Wd, 8, '#55779b'); rect(g, X, Y + 8, Wd, 12, '#6a8caf');
  rect(g, X + 3, Y + 9, Wd / 2 - 4, 6, '#7d9fc2'); rect(g, X + Wd / 2 + 1, Y + 9, Wd / 2 - 4, 6, '#7d9fc2');
  rect(g, X, Y + 6, 3, 14, '#4c6a8a'); rect(g, X + Wd - 3, Y + 6, 3, 14, '#4c6a8a');
}

function drawCatTower(g, f) {
  const X = f.x * TILE, Y = f.y * TILE - 8;
  rect(g, X + 6, Y + 4, 4, 36, '#e3d2b5'); for (let i = 0; i < 9; i++) rect(g, X + 6, Y + 6 + i * 4, 4, 1, '#cdb894');
  rect(g, X + 1, Y + 2, 14, 4, '#9c6b4a'); rect(g, X + 2, Y + 18, 13, 3, '#9c6b4a'); rect(g, X, Y + 38, 16, 2, '#9c6b4a');
  rect(g, X + 13, Y + 21, 1, 5, '#d0504a'); rect(g, X + 12, Y + 26, 3, 3, '#d0504a');
}

// world.isActive(방): 그 방 담당이 일하는 중인가 / world.serverBusy: 서버실이 바쁜가
export function drawFurniture(g, f, t, world) {
  const X = f.x * TILE, Y = f.y * TILE;
  switch (f.type) {
    case 'plant': drawPlant(g, X, Y); break;
    case 'desk': drawDesk(g, f, t, world.isActive(f.act)); break;
    case 'shelf': drawShelf(g, f); break;
    case 'cabinet': rect(g, X + 1, Y - 6, 30, 20, '#8a5f3d'); rect(g, X + 2, Y - 5, 28, 8, '#a0714f'); rect(g, X + 2, Y + 4, 28, 8, '#a0714f'); rect(g, X + 14, Y - 2, 4, 1, '#e8d27a'); rect(g, X + 14, Y + 7, 4, 1, '#e8d27a'); rect(g, X + 6, Y - 10, 6, 4, '#f6f3ec'); rect(g, X + 20, Y - 9, 4, 3, '#58a55c'); break;
    case 'table': rect(g, X + 2, Y - 2, f.w * TILE - 4, 9, '#a0714f'); rect(g, X + 2, Y - 2, f.w * TILE - 4, 1, '#b8885f'); rect(g, X + 2, Y + 7, f.w * TILE - 4, 6, '#7d5539'); rect(g, X + 8, Y - 4, 7, 3, '#4f81bd'); rect(g, X + 9, Y - 6, 6, 2, '#c0504d'); rect(g, X + 44, Y - 8, 2, 7, '#5f5f5f'); rect(g, X + 41, Y - 10, 8, 3, '#f2c94c'); break;
    case 'rack': drawRack(g, f, t, world.serverBusy); break;
    case 'console': rect(g, X + 1, Y - 2, 46, 8, '#6f7780'); rect(g, X + 1, Y + 6, 46, 8, '#565d66'); rect(g, X + 6, Y - 10, 12, 8, '#1e222b'); rect(g, X + 7, Y - 9, 10, 6, '#173a25'); rect(g, X + 26, Y - 10, 12, 8, '#1e222b'); rect(g, X + 27, Y - 9, 10, 6, '#173a25'); rect(g, X + 8, Y - 8, 6, 1, '#5ef08a'); rect(g, X + 28, Y - 6, 7, 1, '#5ef08a'); break;
    case 'aircon': rect(g, X + 1, Y - 6, 14, 36, '#e7ebef'); rect(g, X + 1, Y - 6, 14, 1, '#ffffff'); for (let i = 0; i < 6; i++) rect(g, X + 3, Y - 2 + i * 4, 10, 1, '#b8c2cc'); rect(g, X + 3, Y + 24, 3, 2, '#5ef08a'); break;
    case 'globe': rect(g, X + 5, Y + 12, 6, 3, '#6d4a30'); rect(g, X + 7, Y + 9, 2, 3, '#6d4a30'); rect(g, X + 2, Y - 2, 12, 12, '#2f6db5'); rect(g, X + 4, Y, 4, 4, '#7cc47f'); rect(g, X + 9, Y + 4, 3, 4, '#7cc47f'); rect(g, X + 1, Y + 3, 1, 6, '#c9a03a'); break;
    case 'whiteboard': drawWhiteboard(g, f); break;
    case 'mtable': drawMeetingTable(g, f); break;
    case 'bossdesk': drawBossDesk(g, f); break;
    case 'sofa': drawSofa(g, f); break;
    case 'cattower': drawCatTower(g, f); break;
    case 'boxBack': drawBox(g, f, false); break;
    case 'boxFront': drawBox(g, f, true); break;
    case 'bench': rect(g, X + 2, Y + 4, f.w * TILE - 4, 6, '#a0714f'); rect(g, X + 2, Y + 4, f.w * TILE - 4, 1, '#b8885f'); rect(g, X + 4, Y + 10, 2, 5, '#6d4a30'); rect(g, X + f.w * TILE - 6, Y + 10, 2, 5, '#6d4a30'); break;
  }
}
