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
//   'nap'     개발실 구석 상자에 쏙 들어가 잠
export function chooseIdleActivity(idleSec, ctx) {
  // TODO(직접 구현): 시간이 흐를수록 고양이답게 바뀌도록 5~10줄로 정해 보세요.
  return 'desk';
}
