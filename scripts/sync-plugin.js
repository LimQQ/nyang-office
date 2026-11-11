// 웹 화면(public/js)과 Claude 앱 패널(plugin/)이 같은 사무실 코드를 쓰도록 복사한다.
// public/js 의 sim.js · office.js · sprites.js · idle.js 를 고쳤다면 `node scripts/sync-plugin.js` 를 실행하세요.
//
// 그리고 패널용 배경 그림(바닥·벽·고정 가구)을 PNG 한 장으로 구워 plugin/hooks/core/bg-png.js 에 넣는다.
// 패널은 매 프레임 그림 전체를 SVG 로 새로 보내는데, 수천 개의 작은 사각형 대신 PNG 한 장이면
// 앱이 훨씬 가볍게 그린다. (플러그인 안에서는 Node 의 zlib 을 못 쓰니 여기서 미리 굽는다)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pathToFileURL } = require('url');

const FROM = path.join(__dirname, '..', 'public', 'js');
const TO = path.join(__dirname, '..', 'plugin', 'hooks', 'core');
fs.mkdirSync(TO, { recursive: true });
for (const f of ['sim.js', 'office.js', 'sprites.js', 'idle.js']) {
  const head = `// ⚠️ public/js/${f} 의 복사본입니다. 원본을 고친 뒤 \`node scripts/sync-plugin.js\` 로 다시 복사하세요.\n`;
  fs.writeFileSync(path.join(TO, f), head + fs.readFileSync(path.join(FROM, f), 'utf8'));
  console.log('복사:', f);
}

// ── 아주 작은 캔버스 흉내: fillStyle · globalAlpha · fillRect 만 ──
function parseColor(s) {
  s = String(s).trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255, 1]; }
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [...m[1]].map(c => parseInt(c + c, 16)).concat(1);
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  throw new Error('모르는 색: ' + s);
}

function makeCanvas(W, H) {
  const px = new Float64Array(W * H * 4); // 0~1, 미리 곱하지 않은 RGBA
  return {
    px, W, H, fillStyle: '#000', globalAlpha: 1,
    fillRect(x, y, w, h) {
      const [r, g, b, a0] = parseColor(this.fillStyle);
      const a = a0 * this.globalAlpha;
      for (let yy = Math.max(0, Math.round(y)); yy < Math.min(H, Math.round(y + h)); yy++)
        for (let xx = Math.max(0, Math.round(x)); xx < Math.min(W, Math.round(x + w)); xx++) {
          const i = (yy * W + xx) * 4, da = px[i + 3], oa = a + da * (1 - a);
          if (oa <= 0) continue;
          px[i] = (r / 255 * a + px[i] * da * (1 - a)) / oa;
          px[i + 1] = (g / 255 * a + px[i + 1] * da * (1 - a)) / oa;
          px[i + 2] = (b / 255 * a + px[i + 2] * da * (1 - a)) / oa;
          px[i + 3] = oa;
        }
    },
    drawImage() {},
  };
}

// ── PNG (RGBA 8bit) ──
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png({ px, W, H }) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W * 4; x++) raw[y * (W * 4 + 1) + 1 + x] = Math.round(px[y * W * 4 + x] * 255);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

(async () => {
  const O = await import(pathToFileURL(path.join(TO, 'office.js')).href);
  const out = {};
  for (const layout of ['tall']) {
    O.useLayout(layout);
    const cv = makeCanvas(O.PW, O.PH);
    O.paintStatic(cv);
    out[layout] = png(cv).toString('base64');
    console.log(`배경 PNG(${layout}): ${O.PW}×${O.PH}, ${out[layout].length}자`);
  }
  const body = `// ⚠️ scripts/sync-plugin.js 가 만든 파일입니다. 직접 고치지 마세요.\n// 패널 지도별 배경(바닥·벽·고정 가구) PNG, base64\nexport const BG_PNG = ${JSON.stringify(out)};\n`;
  fs.writeFileSync(path.join(TO, 'bg-png.js'), body);
})();
