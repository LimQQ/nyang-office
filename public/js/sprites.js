// 16×16 도트 스프라이트. 글자 하나가 픽셀 하나이고, 글자 → 색은 팔레트가 정한다.
//  .  투명        k  외곽선      f  털          s  줄무늬(진한 털)
//  w  흰 털       p  분홍(귀·코)  e  눈          x  수염
//  c  옷          t  넥타이      h  머리카락     o  피부   m  입

export const CAT_FRONT = [
  '................',
  '..kk........kk..',
  '..kpk......kpk..',
  '..kppkkkkkkppk..',
  '..kfffsffsfffk..',
  '..kffffffffffk..',
  '..kffeffffeffk..',
  '..kffeffffeffk..',
  'xxkfwwwppwwwfkxx',
  '.xkffwkwwkwffkx.',
  '...kffffffffk...',
  '....kccttcck....',
  '...kfccttccfk...',
  '...kfccccccfk...',
  '....kcccccck....',
  '....kffkkffk....',
];

export const CAT_BACK = [
  '................',
  '..kk........kk..',
  '..kfk......kfk..',
  '..kffkkkkkkffk..',
  '..kfffsffsfffk..',
  '..kffsffffsffk..',
  '..kfffsffsfffk..',
  '..kffffffffffk..',
  'xxkffffffffffkxx',
  '.xkffffffffffkx.',
  '...kffffffffk...',
  '....kcccccck....',
  '...kfccccccfk.k.',
  '...kfccccccfkkfk',
  '....kcccccckkfk.',
  '....kffkkffkfk..',
];

export const CAT_SLEEP = [
  '................',
  '................',
  '................',
  '................',
  '..kk........kk..',
  '..kpk......kpk..',
  '..kppkkkkkkppk..',
  '..kfffsffsfffk..',
  '..kffffffffffk..',
  '..kfkkffffkkfk..',
  'xxkfwwwppwwwfkxx',
  '.kkfffwwwwfffkk.',
  'kfffffffffffssfk',
  'kffffffffffsffk.',
  '.kffffffffffffk.',
  '..kkkkkkkkkkkk..',
];

export const HUMAN_FRONT = [
  '................',
  '.....kkkkkk.....',
  '....khhhhhhk....',
  '...khhhhhhhhk...',
  '...khhhhhhhhk...',
  '...khoooooohk...',
  '...koeooooeok...',
  '...kooooooook...',
  '....koommook....',
  '......kook......',
  '...kcccccccck...',
  '..kcccccccccck..',
  '..kcccccccccck..',
  '..kcccccccccck..',
  '..kcccccccccck..',
  '..kcccccccccck..',
];

// 원본을 살짝 바꾼 프레임들 ─ 걷기(발 모으기), 눈 깜빡임, 좌우 시선
const swapRows = (rows, patch) => rows.map((r, i) => (i in patch ? patch[i] : r));
export const CAT_FRONT_STEP = swapRows(CAT_FRONT, { 15: '.....kfkkfk.....' });
export const CAT_BACK_STEP = swapRows(CAT_BACK, { 15: '.....kfkkfkkfk..' });
export const CAT_FRONT_BLINK = swapRows(CAT_FRONT, { 6: '..kffffffffffk..', 7: '..kfkkffffkkfk..' });
const lookSide = (rows, dx) => rows.map((r, y) => (y === 6 || y === 7 ? r.replace(/e/g, 'f').split('').map((ch, x) => (r[x - dx] === 'e' ? 'e' : ch)).join('') : r));
export const CAT_FRONT_LEFT = lookSide(CAT_FRONT, -1);
export const CAT_FRONT_RIGHT = lookSide(CAT_FRONT, 1);

// 몸 위에 덧그리는 소품: [x, y, 색글자] 목록
export const OV = {
  // 펼친 책: 두 쪽짜리 흰 면 + 빨간 표지, 양옆을 앞발로 잡는다
  book: [
    ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(x => [x, 10, 'k']),
    ...[11, 12].flatMap(y => [[3, y, 'k'], [4, y, 'W'], [5, y, 'W'], [6, y, 'W'], [7, y, 'k'], [8, y, 'k'], [9, y, 'W'], [10, y, 'W'], [11, y, 'W'], [12, y, 'k']]),
    [3, 13, 'k'], ...[4, 5, 6, 7, 8, 9, 10, 11].map(x => [x, 13, 'r']), [12, 13, 'k'],
    [2, 11, 'f'], [2, 12, 'k'], [13, 11, 'f'], [13, 12, 'k'],
  ],
  bookLineA: [[5, 11, 'g'], [10, 11, 'g'], [4, 12, 'g']],
  bookLineB: [[4, 11, 'g'], [11, 11, 'g'], [10, 12, 'g']],
  phone: [[0, 5, 'r'], [1, 5, 'r'], [1, 6, 'r'], [1, 7, 'r'], [1, 8, 'r'], [0, 9, 'r'], [1, 9, 'r'], [2, 9, 'f'], [2, 10, 'f']],
  // 턱 괴기: 흰 앞발로 오른쪽 볼을 받친다
  chin: [[9, 9, 'k'], [10, 9, 'w'], [11, 9, 'w'], [9, 10, 'k'], [10, 10, 'w'], [11, 10, 'w'], [12, 10, 'k'], [10, 11, 'f'], [11, 11, 'f']],
  sweat: [[14, 2, 'b'], [13, 3, 'b'], [14, 3, 'b'], [15, 3, 'b'], [13, 4, 'b'], [14, 4, 'W'], [15, 4, 'b'], [14, 5, 'b']],
  // 뒷모습으로 키보드 두드리기: 양 어깨를 번갈아 들썩인다
  pawsUpA: [[4, 12, 'c'], [4, 13, 'c'], [4, 11, 'f'], [3, 11, 'k']],
  pawsUpB: [[11, 12, 'c'], [11, 13, 'c'], [11, 11, 'f'], [12, 11, 'k']],
  groomA: [[6, 11, 'f'], [7, 11, 'f'], [5, 11, 'k'], [8, 11, 'k']],
  groomB: [[6, 9, 'f'], [7, 9, 'f'], [6, 10, 'f'], [5, 9, 'k']],
  hat: [
    ...[5, 6, 7, 8, 9, 10].map(x => [x, 0, 'k']),
    [4, 1, 'k'], ...[5, 6, 7, 8, 9, 10].map(x => [x, 1, 'H']), [11, 1, 'k'],
    [4, 2, 'k'], ...[5, 6, 7, 8, 9, 10].map(x => [x, 2, 'H']), [11, 2, 'k'],
    ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(x => [x, 3, 'J']),
  ],
  glasses: [
    [4, 5, 'G'], [5, 5, 'G'], [6, 5, 'G'], [9, 5, 'G'], [10, 5, 'G'], [11, 5, 'G'],
    [4, 6, 'G'], [6, 6, 'G'], [7, 6, 'G'], [8, 6, 'G'], [9, 6, 'G'], [11, 6, 'G'],
    [4, 7, 'G'], [6, 7, 'G'], [9, 7, 'G'], [11, 7, 'G'],
  ],
};

export const BASE = {
  k: '#3a2a22', w: '#fff8ee', p: '#f2a0a0', e: '#2a1f1a', x: '#8a7a70',
  W: '#ffffff', g: '#9aa0a6', r: '#d0504a', b: '#5ab0f0', G: '#d8dee6',
};

// 고양이 생김새. type 은 서브에이전트 종류(Explore / Plan / …).
export const LOOKS = {
  claude:  { id: 'claude', name: 'Claude 팀장', f: '#eda15a', s: '#c97834', c: '#f6f3ec', t: '#d97757', dot: '#d97757' },
  Explore: { id: 'explore', name: 'Explore', f: '#b8b8b8', s: '#868686', c: '#5fb760', t: '#5fb760', H: '#3f8f45', J: '#2f6f35', hat: true, dot: '#5fb760' },
  Plan:    { id: 'plan', name: 'Plan', f: '#45403f', s: '#2e2a29', c: '#9466d8', t: '#9466d8', e: '#f2c94c', glasses: true, dot: '#9466d8' },
  other:   { id: 'other', name: '', f: '#e8c39e', s: '#b07a4a', c: '#f2c94c', t: '#f2c94c', dot: '#f2c94c' },
  human:   { id: 'human', name: '집사', h: '#4a3428', o: '#f6d3b3', m: '#b5574b', c: '#6b8fd6', e: '#2a1f1a', dot: '#6b8fd6' },
};

// 방마다 상주하는 담당 고양이
export const RESIDENT_LOOKS = {
  library: { id: 'r-library', name: '사서냥', f: '#f4ead8', s: '#c9a77c', c: '#8a5f3d', t: '#c9a03a', dot: '#c9a03a' },   // 크림색 · 갈색 조끼
  dev:     { id: 'r-dev', name: '개발냥', f: '#8d9aab', s: '#6d7a8b', c: '#2f3542', t: '#79b8ff', dot: '#79b8ff' },       // 러시안블루 · 후드티
  server:  { id: 'r-server', name: '서버냥', f: '#f5f3ef', s: '#cfcac2', c: '#3b4a6b', t: '#5ef08a', dot: '#5ef08a' },    // 흰 고양이 · 남색 작업복
  web:     { id: 'r-web', name: '검색냥', f: '#f4ead8', s: '#d97a3a', c: '#5fa8e0', t: '#5fa8e0', dot: '#5fa8e0' },       // 삼색이 · 하늘색 셔츠
  meeting: { id: 'r-meeting', name: '기획냥', f: '#eadfcb', s: '#6b4a3a', c: '#e88aa8', t: '#e88aa8', dot: '#e88aa8' },   // 샴 · 분홍 셔츠
};

export function lookFor(type) {
  return LOOKS[type] || { ...LOOKS.other, name: type || 'agent' };
}

const cache = new Map();

// 문자열 지도를 16×16 캔버스로 한 번만 구워 두고 재사용한다.
export function sprite(rows, look) {
  let byLook = cache.get(rows);
  if (!byLook) cache.set(rows, (byLook = new Map()));
  let cv = byLook.get(look.id);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = 16;
  const g = cv.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = colorOf(row[x], look);
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  byLook.set(look.id, cv);
  return cv;
}

export function colorOf(ch, look) {
  if (ch === '.') return null;
  return look[ch] || BASE[ch] || null;
}

// 소품은 몇 픽셀 안 되니 매 프레임 직접 찍는다.
export function stamp(g, pixels, look, ox, oy) {
  for (const [x, y, ch] of pixels) {
    const col = colorOf(ch, look);
    if (!col) continue;
    g.fillStyle = col;
    g.fillRect(ox + x, oy + y, 1, 1);
  }
}

for (const [name, rows] of Object.entries({ CAT_FRONT, CAT_BACK, CAT_SLEEP, HUMAN_FRONT, CAT_FRONT_STEP, CAT_BACK_STEP, CAT_FRONT_BLINK, CAT_FRONT_LEFT, CAT_FRONT_RIGHT })) {
  rows.forEach((r, i) => { if (r.length !== 16) console.warn(`sprite ${name} 줄 ${i} 길이 ${r.length}`); });
}
