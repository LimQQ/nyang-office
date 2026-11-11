// 결정 컷인: 무언가 정해진 순간(질문에 답함 · 계획 승인 · 브랜치 결정) 화면 가득 크게 뜨는 연출.
// 번쩍 → 집중선 → 들쭉날쭉한 폭발 말풍선 위에 기울어진 큰 글씨 → 화면 흔들림 → 사라짐.
// 지금 보이는 영역(view)에 맞춰 그리므로, 확대 중이든 아니든 패널을 꽉 채운다.

export const CUTIN_MS = 1900;

const FONT = `font-family="Galmuri11,'Apple SD Gothic Neo','Malgun Gothic',sans-serif" font-weight="bold"`;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = v => Math.round(v * 10) / 10;
const clamp01 = v => Math.max(0, Math.min(1, v));
// 살짝 넘쳤다가 돌아오는 튕김
const backOut = q => { const c = 1.9; return 1 + (c + 1) * (q - 1) ** 3 + c * (q - 1) ** 2; };

// 무엇이 정해졌는지 → 외칠 말과 색
export const CUTIN_KINDS = {
  answer: { text: '정했다냥!', sub: '집사님의 결정', burst: '#ffd23f', band: '#d0504a' },
  plan:   { text: '계획 승인!', sub: '이대로 간다', burst: '#7fe3a0', band: '#2f6db5' },
  branch: { text: '이걸로 간다냥!', sub: '브랜치 결정', burst: '#ffb347', band: '#8064a2' },
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

// elapsed: 컷인이 시작되고 지난 ms, view: 지금 보이는 영역 { x, y, w, h }
export function cutinSvg(kind, elapsed, view) {
  const K = CUTIN_KINDS[kind] || CUTIN_KINDS.answer;
  if (elapsed < 0 || elapsed > CUTIN_MS) return '';
  const { x, y, w, h } = view;
  const cx = x + w / 2, cy = y + h * 0.46;
  const fade = 1 - clamp01((elapsed - (CUTIN_MS - 350)) / 350); // 마지막 0.35초 동안 사라진다
  let s = `<g opacity="${r1(fade * 100) / 100}">`;

  // 1) 어두운 막 + 번쩍
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#0b0d14" opacity="${r1(clamp01(elapsed / 120) * 55) / 100}"/>`;

  // 2) 가운데로 모이는 집중선 (조금씩 돈다)
  const spin = elapsed / 900;
  const R = Math.hypot(w, h);
  let lines = '';
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + spin + (i % 3) * 0.04;
    const inner = R * (0.2 + ((i * 17) % 9) / 60);
    const half = 0.018 + (i % 4) * 0.006;
    const p = (r, da) => `${r1(cx + Math.cos(a + da) * r)} ${r1(cy + Math.sin(a + da) * r)}`;
    lines += `M${p(R, -half)}L${p(inner, 0)}L${p(R, half)}Z`;
  }
  s += `<path d="${lines}" fill="#ffffff" opacity="${r1(clamp01((elapsed - 60) / 150) * 85) / 100}"/>`;

  // 3) 비스듬한 띠가 왼쪽에서 휙 들어온다
  const slide = backOut(clamp01((elapsed - 90) / 220));
  const bandH = h * 0.3, skew = w * 0.12, off = (1 - slide) * -w * 1.3;
  const bx = x + off, by = cy - bandH / 2;
  s += `<path d="M${r1(bx - skew)} ${r1(by + bandH)}L${r1(bx + skew)} ${r1(by)}L${r1(bx + w + skew)} ${r1(by)}L${r1(bx + w - skew)} ${r1(by + bandH)}Z" fill="${K.band}" stroke="#0b0d14" stroke-width="${r1(w * 0.012)}"/>`;
  // 띠 위 줄무늬
  s += `<path d="M${r1(bx)} ${r1(by + bandH * 0.18)}h${r1(w)}M${r1(bx)} ${r1(by + bandH * 0.82)}h${r1(w)}" stroke="#ffffff" stroke-opacity=".35" stroke-width="${r1(h * 0.012)}"/>`;

  // 4) 폭발 말풍선이 퐁! 커졌다가 자리 잡는다
  const pop = elapsed < 140 ? 0 : backOut(clamp01((elapsed - 140) / 230));
  if (pop > 0) {
    const rx = w * 0.46 * pop, ry = h * 0.25 * pop;
    s += `<path d="${burstPath(cx + w * 0.012, cy + h * 0.016, rx, ry, 11, 0.3)}" fill="#0b0d14"/>`; // 그림자
    s += `<path d="${burstPath(cx, cy, rx, ry, 11, 0.3)}" fill="${K.burst}" stroke="#0b0d14" stroke-width="${r1(w * 0.01)}" stroke-linejoin="round"/>`;

    // 5) 기울어진 큰 글씨 (굵은 검은 테두리를 먼저 그리고 흰 글씨를 얹는다)
    const chars = [...K.text].length;
    const size = Math.min(w * 0.82 / chars, h * 0.16) * pop;
    const tilt = -7;
    const text = esc(K.text);
    s += `<g transform="rotate(${tilt} ${r1(cx)} ${r1(cy)})">`;
    s += `<text x="${r1(cx)}" y="${r1(cy + size * 0.36)}" font-size="${r1(size)}" text-anchor="middle" ${FONT} fill="#0b0d14" stroke="#0b0d14" stroke-width="${r1(size * 0.28)}" stroke-linejoin="round">${text}</text>`;
    s += `<text x="${r1(cx)}" y="${r1(cy + size * 0.36)}" font-size="${r1(size)}" text-anchor="middle" ${FONT} fill="#ffffff">${text}</text>`;
    // 작은 부제
    const sub = size * 0.32;
    s += `<text x="${r1(cx)}" y="${r1(cy + size * 0.36 + sub * 1.7)}" font-size="${r1(sub)}" text-anchor="middle" ${FONT} fill="#0b0d14">🐾 ${esc(K.sub)} 🐾</text>`;
    s += `</g>`;
  }

  // 6) 맨 처음 번쩍 (흰 빛)
  const flash = 1 - clamp01(elapsed / 160);
  if (flash > 0) s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff" opacity="${r1(flash * 90) / 100}"/>`;
  return s + '</g>';
}
