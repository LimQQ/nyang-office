// 캔버스 대신 SVG 로 그리는 붓. sim.js 가 쓰는 만큼만(fillStyle · fillRect · globalAlpha · drawImage) 흉내 낸다.
// Claude 앱 패널의 Svg 는 한 장에 131072 글자까지라, 같은 색 사각형을 한 path 로 묶어 짧게 쓴다.
import * as O from './core/office.js';
import * as S from './core/sprites.js';

const r1 = v => Math.round(v * 10) / 10;

export class Recorder {
  constructor() { this.ops = []; this.fillStyle = '#000'; this.globalAlpha = 1; }
  fillRect(x, y, w, h) {
    if (!(w > 0 && h > 0) || this.globalAlpha <= 0) return;
    this.ops.push([r1(x), r1(y), r1(w), r1(h), this.fillStyle, this.globalAlpha]);
  }
  // sprites.js 가 넘겨 주는 { rows, look } (캔버스가 없을 때의 스프라이트)
  drawImage(img, x, y) {
    if (!img || !img.rows) return;
    const byColor = new Map();
    img.rows.forEach((row, yy) => {
      for (let xx = 0; xx < row.length;) {
        const col = S.colorOf(row[xx], img.look);
        let n = 1;
        while (xx + n < row.length && row[xx + n] === row[xx]) n++;
        if (col) { if (!byColor.has(col)) byColor.set(col, []); byColor.get(col).push([xx, yy, n]); }
        xx += n;
      }
    });
    for (const [col, runs] of byColor) for (const [xx, yy, n] of runs) this.ops.push([r1(x + xx), r1(y + yy), n, 1, col, this.globalAlpha]);
  }
  // 이어진 같은 색·투명도 사각형은 path 하나로
  svg() {
    let out = '', cur = null, d = '';
    const flush = () => { if (cur) out += `<path fill="${cur[0]}"${cur[1] < 1 ? ` fill-opacity="${r1(cur[1] * 100) / 100}"` : ''} d="${d}"/>`; };
    for (const [x, y, w, h, fill, a] of this.ops) {
      if (!cur || cur[0] !== fill || cur[1] !== a) { flush(); cur = [fill, a]; d = ''; }
      d += `M${x} ${y}h${w}v${h}h${-w}z`;
    }
    flush();
    return out;
  }
}

// 배경(바닥·벽)은 변하지 않으니 픽셀로 한 번 굽고, 색마다 가장 큰 사각형들로 다시 쪼개 한 번만 만든다.
let bgCache = '', bgLayout = '';
export function backgroundSvg() {
  if (bgCache && bgLayout === O.LAYOUT) return bgCache;
  bgLayout = O.LAYOUT;
  const rec = new Recorder();
  O.paintBackground(rec);
  const W = O.PW, H = O.PH;
  const px = new Int32Array(W * H).fill(-1);
  const colors = [];
  const idx = new Map();
  for (const [x, y, w, h, fill] of rec.ops) {
    if (!idx.has(fill)) { idx.set(fill, colors.length); colors.push(fill); }
    const c = idx.get(fill);
    for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) px[yy * W + xx] = c;
  }
  // 가로 줄 단위로 잇고, 바로 윗줄에 같은 줄이 있으면 세로로 늘린다
  const rects = [];
  let open = new Map(); // 'x,w,c' → rect
  for (let y = 0; y < H; y++) {
    const next = new Map();
    for (let x = 0; x < W;) {
      const c = px[y * W + x];
      let n = 1;
      while (x + n < W && px[y * W + x + n] === c) n++;
      if (c >= 0) {
        const k = x + ',' + n + ',' + c;
        const r = open.get(k);
        if (r) { r.h++; next.set(k, r); } else { const nr = { x, y, w: n, h: 1, c }; rects.push(nr); next.set(k, nr); }
      }
      x += n;
    }
    open = next;
  }
  const byColor = colors.map(() => '');
  for (const r of rects) byColor[r.c] += `M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}z`;
  bgCache = byColor.map((d, i) => `<path fill="${colors[i]}" d="${d}"/>`).join('');
  return bgCache;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONT = `font-family="Galmuri11,'Apple SD Gothic Neo','Malgun Gothic',sans-serif"`;
// 글자 폭 어림: 한글·이모지는 1em, 나머지는 0.6em
function textWidth(s, size) {
  let w = 0;
  for (const ch of String(s)) w += ch.charCodeAt(0) > 0x2e80 ? size : size * 0.6;
  return w;
}
function clip(s, n) { const a = [...String(s)]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); }

const BUBBLE = {
  speech: { fill: '#fffdf5', stroke: '#3a2a22', ink: '#2a1f1a' },
  thought: { fill: '#eef0f6', stroke: '#8a90a6', ink: '#3a3f50', prefix: '💭 ' },
  error: { fill: '#e05a4f', stroke: '#6e1a14', ink: '#ffffff' },
  label: { fill: '#242733', stroke: '#3a3f50', ink: '#eef0f4' },
  zzz: { fill: 'none', stroke: 'none', ink: '#6b8fd6' },
  pet: { fill: '#ffe1ea', stroke: '#c4557a', ink: '#7a2343' },
};

function bubbleSvg(x, y, b) {
  const st = BUBBLE[b.kind] || BUBBLE.speech;
  const size = b.kind === 'label' ? 5.5 : 6.5;
  const text = (st.prefix || '') + clip(b.text, b.kind === 'label' ? 22 : 30);
  const w = Math.ceil(textWidth(text, size)) + 8, h = size + 6;
  let X = Math.round(x - w / 2);
  X = Math.max(1, Math.min(O.PW - w - 1, X));
  const Y = Math.round(y - h - 3);
  let s = '';
  if (st.fill !== 'none') {
    s += `<rect x="${X}" y="${Y}" width="${w}" height="${h}" rx="2" fill="${st.fill}" stroke="${st.stroke}" stroke-width="1"/>`;
    if (b.kind !== 'label') s += `<path d="M${Math.round(x) - 2} ${Y + h - 0.5}l2 3l2 -3z" fill="${st.fill}" stroke="${st.stroke}" stroke-width="1"/><rect x="${Math.round(x) - 2}" y="${Y + h - 1.5}" width="4" height="1.6" fill="${st.fill}"/>`;
  }
  s += `<text x="${X + w / 2}" y="${Y + h / 2 + size * 0.36}" font-size="${size}" text-anchor="middle" fill="${st.ink}" ${FONT}${b.kind === 'zzz' ? ' font-style="italic"' : ''}>${esc(text)}</text>`;
  return s;
}

function tagSvg(c, u) {
  const x = Math.round(u.x), y = Math.round(u.y + 17);
  if (u.crowd) return `<rect x="${x - 2}" y="${y}" width="4" height="4" rx="1" fill="${c.look.dot}" stroke="#1b1d25" stroke-width=".8"/>`;
  const size = 5;
  const w = Math.ceil(textWidth(c.name, size)) + 11;
  return `<g opacity="${u.alpha}"><rect x="${x - w / 2}" y="${y}" width="${w}" height="${size + 3}" rx="1.5" fill="rgba(36,39,51,.85)"/>` +
    `<rect x="${x - w / 2 + 2.5}" y="${y + 2.5}" width="3" height="3" fill="${c.look.dot}"/>` +
    `<text x="${x - w / 2 + 7}" y="${y + size + 0.6}" font-size="${size}" fill="#eef0f4" ${FONT}>${esc(c.name)}</text></g>`;
}

function staticLabels() {
  let s = '';
  for (const r of Object.values(O.ROOMS)) {
    if (!r.emoji) continue;
    const text = `${r.emoji} ${r.name}`;
    const x = r.x0 * O.TILE + 2, y = (r.y1 + 1) * O.TILE - 11, w = textWidth(text, 5) + 5;
    s += `<rect x="${x}" y="${y}" width="${w}" height="8" rx="1.5" fill="rgba(255,255,255,.75)"/><text x="${x + 2.5}" y="${y + 6}" font-size="5" fill="#3a3f50" ${FONT}>${esc(text)}</text>`;
  }
  for (const l of O.LABELS) s += `<text x="${l.x}" y="${l.y}" font-size="${l.size}" text-anchor="middle" fill="${l.color}" ${FONT}>${esc(l.text)}</text>`; // 엘리베이터 표지 등
  return s;
}

function boardSvg(todos) {
  if (!todos || !todos.length) return '';
  const first = Math.max(0, todos.findIndex(x => x.s !== 'completed'));
  const list = todos.slice(Math.max(0, first - 1), Math.max(0, first - 1) + 4);
  const X = O.WHITEBOARD.x * O.TILE + 4, Y = O.WHITEBOARD.y * O.TILE - 12;
  return list.map((it, i) => {
    const mark = it.s === 'completed' ? '✓' : it.s === 'in_progress' ? '▸' : '·';
    const col = it.s === 'completed' ? '#9aa1b2' : it.s === 'in_progress' ? '#d0504a' : '#3a3f50';
    return `<text x="${X}" y="${Y + 5 + i * 5}" font-size="4" fill="${col}" ${FONT}${it.s === 'completed' ? ' text-decoration="line-through"' : ''}>${esc(mark + ' ' + clip(it.t, 18))}</text>`;
  }).join('');
}

// 화면에 보일 영역(사무실 좌표 px). 없으면 사무실 전체
const full = () => ({ x: 0, y: 0, w: O.PW, h: O.PH });
const open = view => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" width="${O.PW * 2}" height="${O.PH * 2}" shape-rendering="crispEdges">`;

// 바닥·벽만 그린 아래층. 같은 view 면 늘 같은 글자라 패널이 다시 받지 않는다
export function backLayerSvg(view = full()) {
  return open(view) + backgroundSvg() + '</svg>';
}

// 움직이는 것(가구 불빛·고양이·종이비행기·조명·말풍선)만 그린 위층. 배경이 비쳐 보이도록 투명하다
// overlay: 맨 위에 덮을 SVG 조각(결정 컷인 등)
export function frontLayerSvg(office, { todos = [], hour, view = full(), overlay = '' } = {}) {
  const rec = new Recorder();
  office.draw(rec, { hour });
  const cats = office.cats().filter(c => !c.gone);
  const tags = cats.map(c => tagSvg(c, office.uiOf(c))).join('');
  const bubbles = cats.map(c => { const u = office.uiOf(c); return u.bubble && u.alpha > 0.2 ? bubbleSvg(u.x, u.y, u.bubble) : ''; }).join('');
  const body = rec.svg();
  const build = ui => open(view) + body + `<g shape-rendering="auto">${staticLabels()}${boardSvg(todos)}${ui}${overlay}</g></svg>`;
  const svg = build(tags + bubbles);
  // Svg 한 장은 131072 글자까지. 넘칠 것 같으면 말풍선을 뺀다
  return svg.length > 128000 ? build(tags) : svg;
}

// 한 장면 전체를 한 장으로 (예전 방식 · 테스트용)
export function frameSvg(office, opts = {}) {
  const back = backLayerSvg(opts.view);
  const front = frontLayerSvg(office, opts);
  return back.replace(/<\/svg>$/, '') + front.replace(/^<svg[^>]*>/, '');
}
