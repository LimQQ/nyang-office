// 서버 없이 사무실이 어떻게 움직이는지 보여 주는 각본 (?demo).
const MIN = 60 * 1000, DAY = 24 * 60 * MIN;

const floors = () => {
  const now = Date.now();
  return [
    { key: 'demo-blog', name: '블로그 글 목록 페이지', dir: 'my-blog', floor: 1, mtime: now - 9 * DAY, sessions: [{ id: 's1', title: '블로그 글 목록 페이지', mtime: now - 9 * DAY }] },
    { key: 'demo-cat', name: '고양이 캐릭터 도트 구현', dir: 'nyang-office', floor: 2, mtime: now, sessions: [{ id: 'live', title: '고양이 캐릭터 도트 구현', mtime: now }, { id: 'old', title: '서버 꼬리 읽기 버그', mtime: now - 180 * MIN }] },
    { key: 'demo-api', name: '로그인 API 테스트', dir: 'burden-api', floor: 3, mtime: now - 40 * MIN, sessions: [{ id: 's9', title: '로그인 API 테스트', mtime: now - 40 * MIN }] },
  ];
};

const SCRIPT = [
  [0, { k: 'prompt', a: 'main', text: '이 사무실을 도트 고양이로 바꿔줄래?' }],
  [1400, { k: 'think', a: 'main', text: '먼저 기존 코드를 읽고 구조부터 파악해야겠다' }],
  [3000, { k: 'tool', a: 'main', id: 't1', tool: 'Read', label: '📖 server.js' }],
  [5200, { k: 'result', a: 'main', id: 't1' }],
  [5400, { k: 'tool', a: 'main', id: 't2', tool: 'Grep', label: '🔎 jsonl' }],
  [7000, { k: 'result', a: 'main', id: 't2' }],
  [7200, { k: 'tool', a: 'main', id: 'A1', tool: 'Agent', label: '📞 Explore 호출' }],
  [8600, { k: 'spawn', a: 'A1', type: 'Explore', desc: '스프라이트 자료 조사' }],
  [9200, { k: 'tool', a: 'main', id: 'A2', tool: 'Agent', label: '📞 Plan 호출' }],
  [10400, { k: 'spawn', a: 'A2', type: 'Plan', desc: '구현 계획 세우기' }],
  [12500, { k: 'tool', a: 'A1', id: 'e1', tool: 'Glob', label: '🔎 **/*.png' }],
  [13500, { k: 'tool', a: 'A2', id: 'p1', tool: 'TodoWrite', label: '🗒️ 할 일 정리' }],
  [13600, { k: 'todos', a: 'A2', items: [{ t: '스프라이트 그리기', s: 'completed' }, { t: '사무실 지도 만들기', s: 'in_progress' }, { t: 'SSE 연결', s: 'pending' }, { t: '엘리베이터 연출', s: 'pending' }] }],
  [13800, { k: 'tool', a: 'main', id: 't3', tool: 'Edit', label: '⌨️ office.js' }],
  [16500, { k: 'tool', a: 'A1', id: 'e2', tool: 'WebSearch', label: '🌐 pixel cat sprite' }],
  [17500, { k: 'result', a: 'main', id: 't3' }],
  [17700, { k: 'tool', a: 'main', id: 't4', tool: 'Bash', label: '$ npm test' }],
  [20500, { k: 'result', a: 'main', id: 't4', err: true, text: 'TypeError: cat.meow is not a function' }],
  [21300, { k: 'think', a: 'main', text: '고양이에게 meow 메서드가 없구나… 추가하자' }],
  [23000, { k: 'tool', a: 'main', id: 't5', tool: 'Edit', label: '⌨️ cat.js' }],
  [23500, { k: 'say', a: 'A2', text: '계획 다 세웠습니다!' }],
  [24500, { k: 'done', a: 'A2' }],
  [26000, { k: 'result', a: 'main', id: 't5' }],
  [26200, { k: 'tool', a: 'main', id: 't6', tool: 'Bash', label: '$ npm test' }],
  [28500, { k: 'result', a: 'main', id: 't6' }],
  [29500, { k: 'done', a: 'A1' }],
  [30500, { k: 'tool', a: 'main', id: 't7', tool: 'mcp__browser__screenshot', label: '🔌 screenshot' }],
  [33000, { k: 'result', a: 'main', id: 't7' }],
  [33300, { k: 'tool', a: 'main', id: 't8', tool: 'AskUserQuestion', label: '❓ 고양이 색은 주황이 좋을까요?' }],
  [38500, { k: 'result', a: 'main', id: 't8' }],
  [39000, { k: 'say', a: 'main', text: '다 됐어요! 사무실이 고양이들로 가득해졌어요 🐾' }],
  [39600, { k: 'end', a: 'main' }],
];
const LOOP_MS = 75 * 1000;

// api: { setFloors(floors, currentKey), reset(snapshot), handle(event) }
export function startDemo(api) {
  let timers = [];
  function run() {
    timers.forEach(clearTimeout);
    api.setFloors(floors(), 'demo-cat/live');
    api.reset({ main: { status: 'idle', quietMs: 10 * MIN }, agents: [], todos: [] });
    timers = SCRIPT.map(([ms, ev]) => setTimeout(() => api.handle({ ...ev }), ms + 2500));
    timers.push(setTimeout(run, LOOP_MS));
  }
  run();
  return { restart: run };
}
