// 확대할 때 카메라가 비출 곳을 고른다.
// 패널은 평소엔 사무실 전체를 보여 주다가, 가끔(회의 시작 · 깜짝 사건) 5초쯤 스르륵 확대한다.
// 확대하는 동안 0.1초마다 chooseFocus(ctx)를 부르고, 돌려준 지점 쪽으로 카메라가 부드럽게 따라간다.
//
// ctx = {
//   reason: 'meeting' | 'surprise' | 'decision'   왜 확대했는지
//   cats: [{ id, name, x, y, state, working, sleeping }]
//          id: 'main'(Claude 팀장) · 'r-library' 'r-dev' 'r-server' 'r-web' 'r-meeting'(담당 고양이)
//              · 'human'(집사) · 그 밖은 서브에이전트
//          x, y: 고양이 몸 가운데 좌표(px, 패널 지도 320×368 기준)
//          state: 'work' | 'idle' | 'going' | 'fun' | ...   working: 지금 일 비행기를 쥐고 있는지
//   planes: [{ to, progress, err }]   지금 날고 있는 종이비행기(받는 고양이 id, 0~1 진행도)
//   meeting: 'kickoff' | 'plan' | 'urgent' | 'tea' | null
//   surprise: { kind: 'box' | 'bird' | 'laser' | 'churu', people: [고양이 id] } | null
//   rooms: { library, dev, server, web, meeting, boss, hall } 각 방의 가운데 { x, y }
//   prev: 바로 전에 고른 지점 (확대가 시작될 때마다 null)
// }
// 돌려줄 것: { x, y } — 이 지점이 화면 가운데에 오도록 카메라가 움직인다.

export function chooseFocus(ctx) {
  const byId = id => ctx.cats.find(c => c.id === id);
  // 여러 고양이의 가운데
  const middle = ids => {
    const cs = ids.map(byId).filter(Boolean);
    if (!cs.length) return null;
    return { x: cs.reduce((s, c) => s + c.x, 0) / cs.length, y: cs.reduce((s, c) => s + c.y, 0) / cs.length };
  };

  if (ctx.reason === 'meeting') return ctx.rooms.meeting;
  if (ctx.reason === 'surprise' && ctx.surprise) {
    const m = middle(ctx.surprise.people);
    if (m) return m;
  }

  // TODO(집사): 그 밖의 경우 어디를 비출지 정해 주세요.
  //   예) 비행기가 날고 있으면 받는 고양이 / 일하는 담당 고양이 / 아니면 팀장
  //   너무 자주 바뀌면 어지러우니, prev 와 가까우면(예: 24px 안) prev 를 그대로 돌려주는 것도 방법이에요.

  const boss = byId('main');
  return boss ? { x: boss.x, y: boss.y } : ctx.rooms.hall;
}
