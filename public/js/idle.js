// Claude 고양이가 할 일이 없을 때(턴이 끝나고 조용할 때) 무엇을 할지 고른다.
// 쉬는 동안 5초마다 한 번 불린다. 같은 값을 계속 돌려주면 하던 걸 그대로 이어 한다.
//
//   idleSec          마지막으로 일한 뒤 흐른 시간(초)
//   ctx.hour         지금 몇 시인지 (0~23)
//   ctx.agentsBusy   아직 일하고 있는 서브에이전트 수
//
// 돌려줄 수 있는 값
//   'desk'    자기 자리에 앉아 있기
//   'groom'   그 자리에서 그루밍(앞발 핥기)
//   'wander'  복도 어슬렁 (부를 때마다 새 목적지로)
//   'nap'     팀장실 구석 상자에 쏙 들어가 잠
export function chooseIdleActivity(idleSec, ctx) {
  // 부하 직원이 아직 일하는 중이면 자리에서 기다린다
  if (ctx.agentsBusy > 0) return 'desk';
  // 늦은 밤에는 금방 졸린다
  const night = ctx.hour >= 23 || ctx.hour < 6;
  if (night) return idleSec < 15 ? 'groom' : 'nap';
  if (idleSec < 15) return 'desk';
  if (idleSec < 35) return 'groom';
  // 한동안은 복도를 어슬렁거리다가 가끔 멈춰 그루밍
  if (idleSec < 150) return Math.floor(idleSec / 5) % 4 === 3 ? 'groom' : 'wander';
  return 'nap';
}
