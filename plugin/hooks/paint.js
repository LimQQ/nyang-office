// 캔버스 대신 SVG 로 그리는 붓. sim.js 가 쓰는 만큼만(fillStyle · fillRect · globalAlpha · drawImage) 흉내 낸다.
// Claude 앱 패널의 Svg 는 한 장에 131072 글자까지라, 같은 색 사각형을 한 path 로 묶어 짧게 쓴다.
import * as O from './core/office.js';
import { BG_PNG } from './core/bg-png.js';
import * as S from './core/sprites.js';

const r1 = v => Math.round(v * 10) / 10;
const r3 = v => Math.round(v * 1000) / 1000;

// 스프라이트 한 장 → 자기 좌표의 SVG 조각. 같은 색 칸을 가로로 잇고, 바로 윗줄과 같은 띠면 세로로 늘려
// 사각형 수를 줄인다. (rows 배열, look 객체)가 같으면 늘 같은 글자라 캐시해 둔다.
const spriteCache = new WeakMap(); // rows → Map(look → svg)
function spriteSvg(rows, look) {
  let byLook = spriteCache.get(rows);
  if (!byLook) spriteCache.set(rows, (byLook = new Map()));
  const hit = byLook.get(look);
  if (hit) return hit;
  const rects = []; // [x, y, w, h, color]
  let open = new Map(); // 'x,w,color' → 윗줄에서 이어 온 사각형
  rows.forEach((row, y) => {
    const next = new Map();
    for (let x = 0; x < row.length;) {
      let n = 1;
      while (x + n < row.length && row[x + n] === row[x]) n++;
      const col = S.colorOf(row[x], look);
      if (col) {
        const k = x + ',' + n + ',' + col;
        const r = open.get(k);
        if (r) { r[3]++; next.set(k, r); } else { const nr = [x, y, n, 1, col]; rects.push(nr); next.set(k, nr); }
      }
      x += n;
    }
    open = next;
  });
  const byColor = new Map();
  for (const [x, y, w, h, col] of rects) byColor.set(col, (byColor.get(col) || '') + `M${x} ${y}h${w}v${h}h${-w}z`);
  let out = '';
  for (const [col, d] of byColor) out += `<path fill="${col}" d="${d}"/>`;
  byLook.set(look, out);
  return out;
}

export class Recorder {
  constructor() { this.ops = []; this.fillStyle = '#000'; this.globalAlpha = 1; }
  fillRect(x, y, w, h) {
    if (!(w > 0 && h > 0) || this.globalAlpha <= 0) return;
    this.ops.push([r1(x), r1(y), r1(w), r1(h), this.fillStyle, this.globalAlpha]);
  }
  // sprites.js 가 넘겨 주는 { rows, look } (캔버스가 없을 때의 스프라이트).
  // 스프라이트는 자기 좌표(0~15 정수)로 한 번만 SVG 로 만들어 두고(spriteSvg, 캐시), translate 로 놓는다.
  // 한 장의 79% 가 고양이 그림이라, 절대 좌표로 한 줄씩 쓰던 때보다 글자 수가 크게 준다.
  drawImage(img, x, y) {
    if (!img || !img.rows) return;
    this.ops.push({ raw: spriteSvg(img.rows, img.look), x: Math.round(x), y: Math.round(y), alpha: this.globalAlpha });
  }
  // 묶음(고양이 한 마리 · 비행기 하나): key, 기준점, 앞으로의 경로(future: [dx, dy] 목록, 없으면 null).
  // svg() 가 <g> 로 감싸 움직임 애니메이션을 단다
  beginItem(key, x, y, future = null) { this.ops.push({ begin: key, x, y, future }); }
  endItem() { this.ops.push({ end: true }); }
  // ── 끝없이 되풀이되는 작은 움직임은 앱이 직접 돌리게(다시 그리지 않아도 계속 움직인다) ──
  // loopFrames: n 장을 stepSec 마다 차례로 보여 주는 순환. pos = 지금 몇 번째 장인지(소수 = 그 장의 어디쯤)
  loopFrames(pos, n, stepSec, draw) {
    const dur = r3(n * stepSec), begin = -r3((((pos % n) + n) % n) * stepSec);
    const cur = Math.floor(((pos % n) + n) % n);
    for (let k = 0; k < n; k++) {
      // discrete 는 keyTimes 가 없으면 값들을 똑같은 간격으로 나눠 보여 준다(글자 수 절약)
      const values = Array.from({ length: n }, (_, j) => (j === k ? 'visible' : 'hidden')).join(';');
      this.ops.push({ open: `<g visibility="${k === cur ? 'visible' : 'hidden'}"><animate attributeName="visibility" values="${values}" dur="${dur}s" begin="${begin}s" calcMode="discrete" repeatCount="indefinite"/>` });
      draw(k);
      this.ops.push({ close: true });
    }
  }
  // blinkLoop: 깜빡이는 불 하나. 한 주기(periodSec)의 duty 까지는 꺼져 있다가 켜진다. phase = 지금 주기의 어디쯤(0~1).
  // 불빛이 수십 개라 하나하나 애니메이션을 달면 무거워서, 시작 시점을 4칸으로 묶어 <defs> 에 한 번만 정의하고
  // 각 불빛은 <use> 로 놓기만 한다.
  blinkLoop(x, y, w, h, on, off, periodSec, duty, phase) {
    const q = Math.round(phase * 4) % 4;
    const key = `${on}|${off}|${r3(periodSec)}|${duty}|${q}|${w}|${h}`;
    this.defs = this.defs || new Map();
    let id = this.defs.get(key)?.id;
    if (!id) {
      id = 'b' + this.defs.size;
      const p = q / 4;
      this.defs.set(key, { id, svg: `<rect id="${id}" width="${w}" height="${h}" fill="${p > duty ? on : off}"><animate attributeName="fill" values="${off};${on}" keyTimes="0;${r3(duty)}" dur="${r3(periodSec)}s" begin="${-r3(p * periodSec)}s" calcMode="discrete" repeatCount="indefinite"/></rect>` });
    }
    this.ops.push({ svg: `<use href="#${id}" x="${r1(x)}" y="${r1(y)}"/>` });
  }
  // blinkLoop 이 모은 정의들 (장면 맨 앞에 둔다)
  defsSvg() {
    return this.defs && this.defs.size ? `<defs>${[...this.defs.values()].map(d => d.svg).join('')}</defs>` : '';
  }
  // 걷는 모습: 앞으로 predictMs 동안의 시간표를 SVG 애니메이션(뚝뚝 끊어 바꾸는 discrete)으로 단다.
  //   · 몸통(위 15줄): 바라보는 방향마다 한 장, 그 방향일 때만 보인다(모퉁이에서 바뀜)
  //   · 다리(맨 아랫줄): (방향 × 보통/발 내딛기) 마다 한 줄, 해당할 때만 보인다
  //   · 발 내딛을 때 1px 위로 들썩임: 고양이 전체를 옮기는 애니메이션 하나
  // 그래서 다리를 바꾸거나 모퉁이에서 방향을 틀어도 새 장을 보낼 필요가 없다.
  //   phase = 지금까지 다리를 바꾼 횟수(소수), rate = 1초에 바꾸는 횟수, faces = [{ t: ms, face }] 방향이 바뀌는 시각
  walkCycle(phase, rate, faces, drawBody, drawLegs) {
    const D = this.predictMs || 0;
    const frac = phase - Math.floor(phase);
    const step0 = Math.floor(phase) % 2; // 0 = 보통, 1 = 발 내딛기
    const first = ((1 - frac) / rate) * 1000; // 첫 다리 바꾸기 시각
    const stepCuts = [];
    for (let ms = first; ms < D; ms += 1000 / rate) stepCuts.push(Math.round(ms));
    const faceCuts = faces.filter(f => f.t > 0 && f.t < D).map(f => Math.round(f.t));
    const stepAt = ms => (step0 + Math.max(0, Math.floor((ms + 1 - first) / (1000 / rate)) + 1)) % 2; // 반올림 1ms 여유
    const faceAt = ms => { let f = faces[0].face; for (const x of faces) if (x.t <= ms + 1) f = x.face; return f; };
    const kt = times => times.map(ms => +(ms / D).toFixed(3)).join(';');
    const toggle = (times, on) => (D > 0 && times.length > 1
      ? `<animate attributeName="opacity" values="${times.map(ms => (on(ms) ? 1 : 0)).join(';')}" keyTimes="${kt(times)}" dur="${D}ms" calcMode="discrete" fill="freeze"/>`
      : '');
    // 들썩임
    const all = [...new Set([0, ...stepCuts, ...faceCuts])].sort((a, b) => a - b);
    const sTimes = [0, ...stepCuts];
    const bob = ms => (stepAt(ms) ? -1 : 0);
    const bobAnim = D > 0 && sTimes.length > 1
      ? `<animateTransform attributeName="transform" type="translate" values="${sTimes.map(ms => `0 ${bob(ms)}`).join(';')}" keyTimes="${kt(sTimes)}" dur="${D}ms" calcMode="discrete" fill="freeze"/>`
      : '';
    this.ops.push({ open: `<g transform="translate(0 ${bob(0)})">${bobAnim}` });
    // 몸통: 방향마다
    const fTimes = [0, ...faceCuts];
    for (const face of [...new Set(fTimes.map(faceAt))]) {
      this.ops.push({ open: `<g opacity="${faceAt(0) === face ? 1 : 0}">${toggle(fTimes, ms => faceAt(ms) === face)}` });
      drawBody(face);
      this.ops.push({ close: true });
    }
    // 다리: 방향 × 발
    for (const combo of [...new Set(all.map(ms => faceAt(ms) + ':' + stepAt(ms)))]) {
      const [face, st] = combo.split(':');
      const on = ms => faceAt(ms) === face && String(stepAt(ms)) === st;
      this.ops.push({ open: `<g opacity="${on(0) ? 1 : 0}">${toggle(all, on)}` });
      drawLegs(face, st === '1');
      this.ops.push({ close: true });
    }
    this.ops.push({ close: true });
  }
  // 이 장면에 나온 묶음들 { key → {x, y, future} }
  anchors() {
    const out = new Map();
    for (const op of this.ops) if (op.begin) out.set(op.begin, { x: op.x, y: op.y, future: op.future });
    return out;
  }
  // 이어진 같은 색·투명도 사각형은 path 하나로. anim(key) 가 돌려준 애니메이션을 묶음 <g> 에 단다
  svg(anim = () => '') {
    let out = '', cur = null, d = '';
    const flush = () => { if (cur) out += `<path fill="${cur[0]}"${cur[1] < 1 ? ` fill-opacity="${r1(cur[1] * 100) / 100}"` : ''} d="${d}"/>`; cur = null; d = ''; };
    for (const op of this.ops) {
      if (op.begin) { flush(); out += anim(op.begin) || '<g>'; continue; }
      if (op.end) { flush(); out += '</g>'; continue; }
      // 다리 한 장: 첫 모습(visibility)을 속성으로 두어, 앱이 애니메이션 없이 첫 순간을 그려도 맞는 다리가 보인다
      if (op.sub) { flush(); out += `<g visibility="${op.sub}">${op.anim}`; continue; }
      if (op.subEnd) { flush(); out += '</g>'; continue; }
      // 되풀이 움직임(loopFrames·blinkLoop)
      if (op.open) { flush(); out += op.open; continue; }
      if (op.close) { flush(); out += '</g>'; continue; }
      if (op.svg) { flush(); out += op.svg; continue; }
      // 미리 만들어 둔 스프라이트: 제자리로 옮겨 놓기만 한다
      if (op.raw !== undefined) { flush(); out += `<g transform="translate(${op.x} ${op.y})"${op.alpha < 1 ? ` opacity="${r1(op.alpha * 100) / 100}"` : ''}>${op.raw}</g>`; continue; }
      const [x, y, w, h, fill, a] = op;
      if (!cur || cur[0] !== fill || cur[1] !== a) { flush(); cur = [fill, a]; d = ''; }
      d += `M${x} ${y}h${w}v${h}h${-w}z`;
    }
    flush();
    return out;
  }
}

// ── 앞으로의 움직임 미리 그리기 ──
// 앱은 1초에 5~8장만, 그것도 0.15~0.5초로 들쭉날쭉하게 그려 간다(재 봤다).
// 그래서 장마다 "지금 위치에서 앞으로 predictMs 동안 갈 길"을 SVG 애니메이션(SMIL)으로 넣는다.
// 걷는 길(path)과 속도를 알기 때문에 앞으로의 위치를 정확히 셀 수 있고, 앱은 그 길을 60fps 로 직접 그린다.
// 다음 장이 언제 오든(predictMs 안이면) 화면 속 고양이는 이미 그 순간의 진짜 위치에 와 있어서 이음매가 없다.
// 기본 모습(transform 없음)이 곧 지금 위치라, 앱이 첫 순간을 애니메이션 없이 그려도 튀지 않는다.
function predictAnims(anchors, ms) {
  const out = new Map();
  if (!(ms > 0)) return out;
  for (const [key, p] of anchors) {
    const f = p.future;
    if (!f || f.length < 2 || f.every(([dx, dy]) => Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05)) continue;
    const values = f.map(([dx, dy]) => `${r1(dx)} ${r1(dy)}`).join(';');
    out.set(key, `<g><animateTransform attributeName="transform" type="translate" values="${values}" dur="${ms}ms" calcMode="linear" fill="freeze"/>`);
  }
  return out;
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

// 미리 구운 배경 PNG 가 있는 지도인가 (scripts/sync-plugin.js 가 만든다)
const baked = () => !!BG_PNG[O.LAYOUT];

// 아래층: 바닥·벽(+ 미리 구운 PNG 가 있으면 고정 가구까지). 같은 view 면 늘 같은 글자다
export function backLayerSvg(view = full()) {
  if (baked()) {
    // 사각형 수천 개 대신 PNG 한 장 → 앱이 훨씬 가볍게 그린다. 도트가 번지지 않게 pixelated
    return open(view) + `<image href="data:image/png;base64,${BG_PNG[O.LAYOUT]}" x="0" y="0" width="${O.PW}" height="${O.PH}" preserveAspectRatio="none" style="image-rendering:pixelated"/></svg>`;
  }
  return open(view) + backgroundSvg() + '</svg>';
}

// 움직이는 것(가구 불빛·고양이·종이비행기·조명·말풍선)만 그린 위층. 배경이 비쳐 보이도록 투명하다
// overlay: 맨 위에 덮을 SVG 조각(결정 컷인 등)
// predictMs: 앞으로 이만큼(ms)의 움직임을 미리 그린다. 다음 장이 그 안에 오면 이음매 없이 이어진다
export function frontLayerSvg(office, { todos = [], hour, view = full(), overlay = '', rootOverlay = '', predictMs = 0 } = {}) {
  const rec = new Recorder();
  rec.predictMs = predictMs; // 걷는 다리 바꿀 시각도 이만큼 앞까지 미리 넣는다
  office.draw(rec, { hour, skipStatic: baked(), predictMs, predictSteps: Math.max(2, Math.round(predictMs / 100)) });
  const anims = predictAnims(rec.anchors(), predictMs);
  const anim = key => anims.get(key) || '';
  const cats = office.cats().filter(c => !c.gone);
  // 이름표·말풍선도 고양이와 같이 미끄러진다
  const wrap = (c, s) => (s && anims.has('cat:' + c.id) ? `${anim('cat:' + c.id)}${s}</g>` : s);
  const tags = cats.map(c => wrap(c, tagSvg(c, office.uiOf(c)))).join('');
  const bubbles = cats.map(c => { const u = office.uiOf(c); return u.bubble && u.alpha > 0.2 ? wrap(c, bubbleSvg(u.x, u.y, u.bubble)) : ''; }).join('');
  const body = rec.svg(anim);
  const defs = rec.defsSvg(); // 서버 불빛 정의(<use> 가 가리킨다), svg() 다음에 모아야 다 들어 있다
  const build = ui => open(view) + defs + body + `<g shape-rendering="auto">${staticLabels()}${boardSvg(todos)}${ui}${overlay}</g>${rootOverlay}</svg>`; // rootOverlay: <svg> 바로 아래 애니메이션(컷인 화면 흔들림)
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
