// 냥냥 오피스 — Claude 앱 채팅 옆 패널.
// 이 세션에서 일어나는 일(대화 줄, 도구 호출, 서브에이전트)을 받아 도트 고양이 사무실을 그린다.
// 사무실 움직임은 웹 화면과 같은 코드(core/sim.js)를 쓰고, 그림은 SVG 로 그린다(paint.js).
import type { Register } from 'claude-code'

import { createOffice, lightOf } from './core/sim.js'
import { frameSvg } from './paint.js'
import { rowEvents } from './rows.js'

const PANE = 'nyang-office'
const TITLE = '🐾 냥냥 오피스'
const TICK_MS = 100 // 1초에 10장 (패널이 다시 그릴 수 있는 최대)
const SKY: Record<string, string> = { 낮: '☀️ 낮', 노을: '🌇 노을', 저녁: '🌆 저녁', 아침: '🌅 아침', 새벽: '🌌 새벽', 밤: '🌙 밤' }

type LogLine = { at: string; who: string; text: string }
type Office = ReturnType<typeof createOffice>

let office: Office | null = null
let todos: { t: string; s: string }[] = []
let logs: LogLine[] = []
let statsDirty: unknown = null
const spawned = new Set<string>()
const agentInfo = new Map<string, { type: string; desc: string }>()

const hhmm = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const hourNow = () => {
  const d = new Date()
  return d.getHours() + d.getMinutes() / 60
}

// 서브에이전트의 첫 줄이 오면 엘리베이터로 출근시킨다
function ensureAgent(id: string) {
  if (!office || spawned.has(id)) return
  spawned.add(id)
  const info = agentInfo.get(id)
  office.handle({ k: 'spawn', a: id, type: info?.type || 'general-purpose', desc: info?.desc || '' })
}

function feed(ev: { k: string; a?: string; [key: string]: unknown }) {
  if (!office) return
  try {
    if (ev.k === 'todos') todos = ev.items as typeof todos
    office.handle(ev)
  } catch {
    // 이벤트 하나가 이상해도 사무실은 계속 돈다
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    let saved: unknown = null
    try {
      saved = await $.store.get('stats')
    } catch {}
    logs = []
    todos = []
    spawned.clear()
    office = createOffice({
      log: (c: { name: string }, text: string) => {
        logs = [{ at: hhmm(), who: c.name, text }, ...logs].slice(0, 30)
      },
      todos: (items: typeof todos) => {
        todos = items
      },
      stats: saved,
      saveStats: (s: unknown) => {
        statsDirty = s
      },
    })
    office.reset({ main: { quietMs: 1e9 } }, '')

    let last = Date.now()
    let lastSave = last
    $.clock.every(TICK_MS, () => {
      if (!office) return
      const t = Date.now()
      office.step(Math.min(0.5, (t - last) / 1000))
      last = t
      $.ui.invalidate('ui.render')
      if (statsDirty && t - lastSave > 5000) {
        lastSave = t
        const s = statsDirty
        statsDirty = null
        void $.store.set('stats', s).catch(() => {})
      }
    })

    await $.command.register({
      name: 'nyang-office',
      description: '냥냥 오피스 패널 열기 (고양이 사무실)',
    })
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'nyang-office' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, focus: true })
    return { text: '🐾 냥냥 오피스를 열었어요.' }
  })

  // 대화에 쌓이는 줄을 그대로 지켜본다. 줄은 바꾸지 않는다.
  on('session.append', async ($, e, next) => {
    try {
      const a = e.agentId ?? 'main'
      if (a !== 'main') ensureAgent(a)
      for (const ev of rowEvents(e.message, a)) feed(ev)
    } catch {}
    return next(e)
  }).catch(($, e, next) => next(e)) // 무슨 일이 있어도 대화 줄은 그대로 흘려보낸다

  // 서브에이전트 종류(Explore, Plan …)와 할 일 이름을 기억해 둔다
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    try {
      if (r.agentId) {
        agentInfo.set(r.agentId, { type: e.subagentType, desc: String(e.description || '').slice(0, 40) })
        ensureAgent(r.agentId)
      }
    } catch {}
    return r
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.agentId) feed({ k: 'done', a: e.agentId })
      else feed({ k: 'end', a: 'main' })
    } catch {}
    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const T = $.ui.resolve(e) as any
    const { Box, Text, Button } = T
    const o = office
    if (!o) return <Text dimColor>사무실 문 여는 중…</Text>

    const champ = o.champion()
    const st = o.stats
    const sky = SKY[lightOf(hourNow()).name] || ''
    const head = `${sky} · 🏆 ${champ ? `${champ.name} ${champ.count}건` : '오늘의 사원 아직 없음'} · 🐟 다음 츄르까지 ${Math.max(0, 12 - st.sinceChuru)}건`
    const pets = o
      .cats()
      .filter((c: any) => !c.gone && c.alpha > 0.5)
      .map((c: any) => (
        <Button key={'pet-' + c.id} label={'🐾 ' + c.name} onPress={() => void o.pet(c.id)} />
      ))
    const surprise = (
      <Button key="surprise" label="🎲 깜짝 이벤트" onPress={() => void o.surpriseNow()} />
    )
    const lines = logs.slice(0, 6).map((l, i) => (
      <Text key={'log-' + i} dimColor={i > 0}>
        {l.at} {l.who} · {l.text}
      </Text>
    ))

    if (e.surface === 'terminal') {
      return (
        <Box flexDirection="column">
          <Text>{head}</Text>
          <Text dimColor>그림은 Claude 앱(데스크톱 · 모바일)에서 보여요. 여기서는 업무 일지만 보여 드려요.</Text>
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {pets}
            {surprise}
          </Box>
          {lines}
        </Box>
      )
    }

    const svg = frameSvg(o, { todos, hour: hourNow() } as any)
    return (
      <Box flexDirection="column" gap={1}>
        <T.Svg source={svg} alt="냥냥 오피스: 도트 고양이들이 Claude의 일을 나눠 하는 사무실" />
        <Text>{head}</Text>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {pets}
          {surprise}
        </Box>
        <Box flexDirection="column">{lines}</Box>
      </Box>
    )
  })
}
