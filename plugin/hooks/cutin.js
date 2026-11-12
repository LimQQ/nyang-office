// 결정 컷인: 고양이들이 회의에서 무언가를 정한 순간 화면 가득 크게 뜨는 연출(정한 고양이의 도트 초상과 함께).
// 번쩍 → 집중선 → 들쭉날쭉한 폭발 말풍선 위에 기울어진 큰 글씨 → 화면 흔들림 → 사라짐.
// 지금 보이는 영역(view)에 맞춰 그리므로 패널을 꽉 채운다.

import { colorOf } from './core/sprites.js';

export const CUTIN_MS = 1900;

const FONT = `font-family="Galmuri11,'Apple SD Gothic Neo','Malgun Gothic',sans-serif" font-weight="bold"`;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = v => Math.round(v * 10) / 10;
const clamp01 = v => Math.max(0, Math.min(1, v));
// 살짝 넘쳤다가 돌아오는 튕김
const backOut = q => { const c = 1.9; return 1 + (c + 1) * (q - 1) ** 3 + c * (q - 1) ** 2; };

// 고양이들이 회의에서 무엇을 정했는지 → 외칠 말과 색 (sub 의 {name} 은 정한 고양이 이름)
export const CUTIN_KINDS = {
  plan:   { text: '계획 확정!', sub: '{name}이 정했다냥', burst: '#ffd23f', band: '#2f6db5' },
  urgent: { text: '다시 간다냥!', sub: '{name}의 긴급 결단', burst: '#ffb347', band: '#d0504a' },
};

// 화면 흔들림: 처음 0.45초 동안 지금 몇 px 밀렸는지
export function shakeOf(elapsed) {
  if (elapsed < 120 || elapsed > 570) return [0, 0];
  const k = 1 - (elapsed - 120) / 450;
  const s = Math.floor(elapsed / 40);
  return [((s * 7) % 5 - 2) * 1.6 * k, ((s * 3) % 5 - 2) * 1.6 * k];
}

// 들쭉날쭉한 폭발 모양(별 꼭짓점 n개)
function burstPath(cx, cy, rx, ry, n, seed) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + seed;
    const jag = i % 2 ? 0.62 + ((i * 37) % 7) / 40 : 1 + ((i * 13) % 5) / 25;
    d += (i ? 'L' : 'M') + r1(cx + Math.cos(a) * rx * jag) + ' ' + r1(cy + Math.sin(a) * ry * jag);
  }
  return d + 'Z';
}

// 결정한 이의 도트 초상: 16×16 스프라이트를 px 크기로 키워 액자에 넣는다
function portraitSvg(who, X, Y, side, band) {
  const px = side / 18;
  let s = `<rect x="${r1(X)}" y="${r1(Y)}" width="${r1(side)}" height="${r1(side)}" fill="${band}" stroke="#0b0d14" stroke-width="${r1(px * 0.8)}"/>`;
  s += `<rect x="${r1(X + px * 0.6)}" y="${r1(Y + px * 0.6)}" width="${r1(side - px * 1.2)}" height="${r1(side - px * 1.2)}" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width="${r1(px * 0.4)}"/>`;
  // 같은 색끼리 가로로 이어 path 하나씩
  const byColor = new Map();
  who.rows.forEach((row, yy) => {
    for (let xx = 0; xx < row.length;) {
      let n = 1;
      while (xx + n < row.length && row[xx + n] === row[xx]) n++;
      const col = colorOf(row[xx], who.look);
      if (col) byColor.set(col, (byColor.get(col) || '') + `M${r1(X + (xx + 1) * px)} ${r1(Y + (yy + 1) * px)}h${r1(n * px)}v${r1(px)}h${r1(-n * px)}z`);
      xx += n;
    }
  });
  s += `<g shape-rendering="crispEdges">`;
  for (const [col, d] of byColor) s += `<path fill="${col}" d="${d}"/>`;
  s += `</g>`;
  // 이름표
  const fs = side * 0.13;
  const label = esc(who.name);
  s += `<rect x="${r1(X - px)}" y="${r1(Y + side - fs * 0.6)}" width="${r1(side + px * 2)}" height="${r1(fs * 1.5)}" fill="#0b0d14"/>`;
  s += `<text x="${r1(X + side / 2)}" y="${r1(Y + side + fs * 0.55)}" font-size="${r1(fs)}" text-anchor="middle" ${FONT} fill="#ffffff">${label}</text>`;
  return s;
}

// ── 컷인 전체를 SVG 애니메이션(SMIL) 한 벌로 ──
// 예전엔 컷인 1.9초 동안 1초에 10장씩 새로 그려 보냈는데(그만큼 렉), 이제는 모든 움직임을 애니메이션으로 넣어
// 앱이 직접 돌린다. 도중에 다시 그리게 되어도 begin="-지난시간" 으로 이어서 시작하니 처음부터 다시 하지 않는다.
// 모든 정적 속성은 "지금(elapsed) 모습"으로 둬서, 앱이 첫 순간을 애니메이션 없이 그려도 튀지 않는다.
const r3 = v => Math.round(v * 10000) / 10000;

// fn(e) 를 [0, CUTIN_MS] 동안 t0~t1 구간에서 steps 번 찍어 values/keyTimes 로 만든다(그 밖은 양 끝 값 그대로)
function track(fn, t0, t1, steps) {
  const pts = [0];
  for (let i = 0; i <= steps; i++) pts.push(t0 + ((t1 - t0) * i) / steps);
  pts.push(CUTIN_MS);
  const uniq = [...new Set(pts.map(p => Math.max(0, Math.min(CUTIN_MS, Math.round(p)))))].sort((a, b) => a - b);
  return { values: uniq.map(e => fn(e)).join(';'), keyTimes: uniq.map(e => r3(e / CUTIN_MS)).join(';') };
}

// elapsed: 컷인이 시작되고 지난 ms, view: 보이는 영역 { x, y, w, h }
// who: 결정한 이 { rows, look, name } (도트 초상으로 함께 뜬다, 없으면 생략)
// 돌려주는 것: { svg: 장면 맨 위에 덮을 조각, root: <svg> 바로 아래에 둘 화면 흔들림 애니메이션 }
export function cutinSvg(kind, elapsed, view, who = null) {
  const K = CUTIN_KINDS[kind] || CUTIN_KINDS.plan;
  const subText = K.sub.replace('{name}', who ? who.name : '고양이들');
  if (elapsed < 0 || elapsed > CUTIN_MS) return { svg: '', root: '' };
  const { x, y, w, h } = view;
  const cx = x + w / 2, cy = y + h * (who ? 0.36 : 0.46); // 초상이 있으면 말풍선을 위로
  const T = `dur="${CUTIN_MS}ms" begin="${-Math.round(elapsed)}ms" fill="freeze"`;
  const anim = (attr, fn, t0, t1, steps) => { const k = track(fn, t0, t1, steps); return `<animate attributeName="${attr}" values="${k.values}" keyTimes="${k.keyTimes}" ${T}/>`; };
  const animT = (type, fn, t0, t1, steps) => { const k = track(fn, t0, t1, steps); return `<animateTransform attributeName="transform" type="${type}" values="${k.values}" keyTimes="${k.keyTimes}" ${T}/>`; };
  const num = v => String(r1(v * 100) / 100);

  // 마지막 0.35초 동안 사라진다
  const fade = e => 1 - clamp01((e - (CUTIN_MS - 350)) / 350);
  let s = `<g opacity="${num(fade(elapsed))}">${anim('opacity', e => num(fade(e)), CUTIN_MS - 350, CUTIN_MS, 1)}`;

  // 1) 어두운 막
  const dark = e => clamp01(e / 120) * 0.55;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#0b0d14" opacity="${num(dark(elapsed))}">${anim('opacity', e => num(dark(e)), 0, 120, 1)}</rect>`;

  // 2) 가운데로 모이는 집중선 (천천히 돈다)
  const R = Math.hypot(w, h);
  let lines = '';
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + (i % 3) * 0.04;
    const inner = R * (0.2 + ((i * 17) % 9) / 60);
    const half = 0.018 + (i % 4) * 0.006;
    const p = (r, da) => `${r1(cx + Math.cos(a + da) * r)} ${r1(cy + Math.sin(a + da) * r)}`;
    lines += `M${p(R, -half)}L${p(inner, 0)}L${p(R, half)}Z`;
  }
  const deg = e => r1((e / 900) * (180 / Math.PI));
  const linesOp = e => clamp01((e - 60) / 150) * 0.85;
  s += `<g transform="rotate(${deg(elapsed)} ${r1(cx)} ${r1(cy)})">${animT('rotate', e => `${deg(e)} ${r1(cx)} ${r1(cy)}`, 0, CUTIN_MS, 1)}`;
  s += `<path d="${lines}" fill="#ffffff" opacity="${num(linesOp(elapsed))}">${anim('opacity', e => num(linesOp(e)), 60, 210, 1)}</path></g>`;

  // 3) 비스듬한 띠가 왼쪽에서 휙 들어온다 (살짝 넘쳤다 돌아오는 곡선은 여러 점으로 찍어 그대로)
  const off = e => r1((1 - backOut(clamp01((e - 90) / 220))) * -w * 1.3);
  const bandH = h * 0.3, skew = w * 0.12, by = cy - bandH / 2;
  s += `<g transform="translate(${off(elapsed)} 0)">${animT('translate', e => `${off(e)} 0`, 90, 310, 10)}`;
  s += `<path d="M${r1(x - skew)} ${r1(by + bandH)}L${r1(x + skew)} ${r1(by)}L${r1(x + w + skew)} ${r1(by)}L${r1(x + w - skew)} ${r1(by + bandH)}Z" fill="${K.band}" stroke="#0b0d14" stroke-width="${r1(w * 0.012)}"/>`;
  s += `<path d="M${r1(x)} ${r1(by + bandH * 0.18)}h${r1(w)}M${r1(x)} ${r1(by + bandH * 0.82)}h${r1(w)}" stroke="#ffffff" stroke-opacity=".35" stroke-width="${r1(h * 0.012)}"/></g>`;

  // 4) 폭발 말풍선 + 기울어진 큰 글씨가 퐁! 커졌다가 자리 잡는다 (가운데를 기준으로 키운다)
  const pop = e => (e < 140 ? 0 : r1(backOut(clamp01((e - 140) / 230)) * 1000) / 1000);
  const rx = w * 0.46, ry = h * 0.25;
  const chars = [...K.text].length;
  const size = Math.min((w * 0.82) / chars, h * 0.16);
  const text = esc(K.text);
  s += `<g transform="translate(${r1(cx)} ${r1(cy)})"><g transform="scale(${pop(elapsed)})">${animT('scale', e => String(pop(e)), 140, 370, 10)}<g transform="translate(${-r1(cx)} ${-r1(cy)})">`;
  s += `<path d="${burstPath(cx + w * 0.012, cy + h * 0.016, rx, ry, 11, 0.3)}" fill="#0b0d14"/>`; // 그림자
  s += `<path d="${burstPath(cx, cy, rx, ry, 11, 0.3)}" fill="${K.burst}" stroke="#0b0d14" stroke-width="${r1(w * 0.01)}" stroke-linejoin="round"/>`;
  s += `<g transform="rotate(-7 ${r1(cx)} ${r1(cy)})">`;
  s += `<text x="${r1(cx)}" y="${r1(cy + size * 0.36)}" font-size="${r1(size)}" text-anchor="middle" ${FONT} fill="#0b0d14" stroke="#0b0d14" stroke-width="${r1(size * 0.28)}" stroke-linejoin="round">${text}</text>`;
  s += `<text x="${r1(cx)}" y="${r1(cy + size * 0.36)}" font-size="${r1(size)}" text-anchor="middle" ${FONT} fill="#ffffff">${text}</text>`;
  const sub = size * 0.32;
  s += `<text x="${r1(cx)}" y="${r1(cy + size * 0.36 + sub * 1.7)}" font-size="${r1(sub)}" text-anchor="middle" ${FONT} fill="#0b0d14">🐾 ${esc(subText)} 🐾</text>`;
  s += `</g></g></g></g>`;

  // 5) 결정한 이의 초상이 아래에서 쑥 올라온다
  if (who && who.rows) {
    const side = Math.min(w * 0.38, h * 0.3);
    const X = cx - side / 2, Yend = y + h * 0.62;
    const drop = e => r1((1 - backOut(clamp01((e - 220) / 260))) * h * 0.45);
    s += `<g transform="translate(0 ${drop(elapsed)})">${animT('translate', e => `0 ${drop(e)}`, 220, 480, 10)}${portraitSvg(who, X, Yend, side, K.band)}</g>`;
  }

  // 6) 맨 처음 번쩍 (흰 빛)
  const flash = e => (1 - clamp01(e / 160)) * 0.9;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff" opacity="${num(flash(elapsed))}">${anim('opacity', e => num(flash(e)), 0, 160, 1)}</rect>`;
  s += '</g>';

  // 7) 화면 흔들림: 맨 바깥 <svg> 의 viewBox 를 40ms 마다 뚝뚝 옮긴다(사무실까지 같이 흔들린다)
  const box = e => { const [sx, sy] = shakeOf(e); return `${r1(x + sx)} ${r1(y + sy)} ${w} ${h}`; };
  const shake = track(box, 120, 600, 12);
  const root = `<animate attributeName="viewBox" values="${shake.values}" keyTimes="${shake.keyTimes}" calcMode="discrete" ${T}/>`;
  return { svg: s, root };
}
