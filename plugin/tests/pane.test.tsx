import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'nyang-office',
  component: 'Pane',
  requestId: 'nyang-office',
  props: {
    title: '🐾 냥냥 오피스',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('사무실 패널: 대화 줄을 받아 그림·버튼·일지를 그린다', async ($, on) => {
  on('command.register', () => ({ value: { command: 'nyang-office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.append({
    uuid: 'u1',
    door: 'prompt',
    origin: { kind: 'person' },
    message: { type: 'user', role: 'user', content: [{ type: 'text', text: '고양이 사무실 꾸며줘' }] },
  } as any)
  await $.session.append({
    uuid: 'u2',
    door: 'response',
    origin: { kind: 'model', model: 'x' },
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/a/server.js' } }] },
  } as any)

  for (const surface of ['desktop', 'mobile', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /server\.js/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'pet-r-dev' })).toBeFalsy() // 쓰다듬기 버튼은 없앴다
    if (surface !== 'terminal') {
      const svgs: any[] = await ui.findAll({ type: 'Svg' } as any)
      expect(svgs.length).toBe(1) // 배경과 움직이는 층을 한 장으로
      for (const svg of svgs) {
        const src = String(svg.source ?? svg.props?.source ?? '')
        expect(src.startsWith('<svg')).toBe(true)
        expect(src.length).toBeLessThan(131072)
      }
      // 패널은 세로로 긴 지도(320×368)를 쓴다
      expect(String(svgs[0].source ?? svgs[0].props?.source)).toContain('width="640" height="736"')
      expect(await ui.find({ type: 'Button', key: 'zoom' })).toBeFalsy() // 확대는 버튼 없이 가끔 저절로
    }
    await ui.press({ key: 'surprise' } as any)
    await ui.unmount()
  }
})

test('결정 컷인: 집사가 질문에 답하는 건 고양이들의 결정이 아니라 컷인이 뜨지 않는다', async ($, on) => {
  on('command.register', () => ({ value: { command: 'nyang-office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.append({
    uuid: 'q1',
    door: 'response',
    origin: { kind: 'model', model: 'x' },
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'tool_use', id: 'ask1', name: 'AskUserQuestion', input: { questions: [{ question: '어느 쪽?' }] } }] },
  } as any)
  const first = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const before: any[] = await first.findAll({ type: 'Svg' } as any)
  expect(String(before[0].source ?? before[0].props?.source)).not.toContain('#0b0d14')
  await first.unmount()

  await $.session.append({
    uuid: 'q2',
    door: 'tool_result',
    origin: { kind: 'tool' },
    message: { type: 'user', role: 'user', content: [{ type: 'tool_result', tool_use_id: 'ask1', content: '왼쪽' }] },
  } as any)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svgs: any[] = await ui.findAll({ type: 'Svg' } as any)
  const front = String(svgs[0].source ?? svgs[0].props?.source)
  expect(front).not.toContain('#0b0d14') // 컷인은 고양이 회의가 무언가를 정했을 때만
  expect(front.length).toBeLessThan(131072)
  await ui.unmount()
})
