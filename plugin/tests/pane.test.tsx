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
    expect(await ui.find({ type: 'Button', key: 'pet-r-dev' })).toBeTruthy()
    if (surface !== 'terminal') {
      const svg: any = await ui.find({ type: 'Svg' } as any)
      expect(svg).toBeTruthy()
      const src = String(svg.source ?? svg.props?.source ?? '')
      expect(src.startsWith('<svg')).toBe(true)
      expect(src.length).toBeLessThan(131072)
    }
    await ui.press({ key: 'pet-r-dev' } as any)
    await ui.press({ key: 'surprise' } as any)
    await ui.unmount()
  }
})
