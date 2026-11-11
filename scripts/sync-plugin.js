// 웹 화면(public/js)과 Claude 앱 패널(plugin/)이 같은 사무실 코드를 쓰도록 복사한다.
// public/js 의 sim.js · office.js · sprites.js · idle.js 를 고쳤다면 `node scripts/sync-plugin.js` 를 실행하세요.
const fs = require('fs');
const path = require('path');

const FROM = path.join(__dirname, '..', 'public', 'js');
const TO = path.join(__dirname, '..', 'plugin', 'hooks', 'core');
fs.mkdirSync(TO, { recursive: true });
for (const f of ['sim.js', 'office.js', 'sprites.js', 'idle.js']) {
  const head = `// ⚠️ public/js/${f} 의 복사본입니다. 원본을 고친 뒤 \`node scripts/sync-plugin.js\` 로 다시 복사하세요.\n`;
  fs.writeFileSync(path.join(TO, f), head + fs.readFileSync(path.join(FROM, f), 'utf8'));
  console.log('복사:', f);
}
