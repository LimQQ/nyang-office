// 냥냥 오피스 — Claude 앱 채팅 옆 패널.
// 이 세션에서 일어나는 일(대화 줄, 도구 호출, 서브에이전트)을 받아 도트 고양이 사무실을 그린다.
// 사무실 움직임은 웹 화면과 같은 코드(core/sim.js)를 쓰고, 그림은 SVG 로 그린다(paint.js).
import type { Register } from 'claude-code'

import * as O from './core/office.js'
import { createOffice, lightOf } from './core/sim.js'
import { CUTIN_MS, cutinSvg, shakeOf } from './cutin.js'
import { chooseFocus } from './focus.js'
import { backLayerSvg, frontLayerSvg } from './paint.js'
import { rowEvents } from './rows.js'

// 패널은 세로로 긴 지도를 쓴다(웹 화면은 가로로 긴 'wide' 그대로)
O.useLayout('tall')

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

// ── 화면 ──
// 그림은 두 장을 겹친다: 바닥·벽(거의 안 바뀜) 위에 움직이는 것만 그린 투명한 한 장.
// 매 틱마다 그림을 미리 만들어 두고, 바뀐 게 있을 때만 패널에 다시 그려 달라고 한다.
type View = { x: number; y: number; w: number; h: number }
type Reason = 'meeting' | 'surprise' | 'decision'
const ZOOM = 2 // 확대 배율
const ZOOM_HOLD_MS = 5000 // 한 번 확대하면 이만큼 보여 준다
const ZOOM_COOLDOWN_MS = 25000 // 확대는 가끔씩만: 끝나고 이만큼은 다시 확대하지 않는다
let zoomAmt = 0 // 0(전체) ~ 1(확대), 부드럽게 오간다
let zoom: { reason: Reason; until: number } | null = null
let zoomReadyAt = 0
let cam = { x: 0, y: 0 } // 확대할 때 비출 곳 (부드럽게 따라간다)
let focusPrev: { x: number; y: number } | null = null
let cutin: { kind: string; at: number } | null = null
let lastMeeting: string | null = null
let lastSurprise: string | null = null
let frame = { back: '', front: '', head: '', sig: '' }
let paintedAt = 0

const roomCenters = () =>
  Object.fromEntries(
    Object.entries(O.ROOMS).map(([k, r]: [string, any]) => [
      k,
      { x: ((r.x0 + r.x1 + 1) / 2) * O.TILE, y: ((r.y0 + r.y1 + 1) / 2) * O.TILE },
    ]),
  )

// 잠깐 확대해서 보여 줄 일이 생겼다 (가끔씩만)
function zoomFor(reason: Reason, force = false) {
  const t = Date.now()
  if (!force && (zoom || t < zoomReadyAt)) return
  zoom = { reason, until: t + ZOOM_HOLD_MS }
  zoomReadyAt = t + ZOOM_HOLD_MS + ZOOM_COOLDOWN_MS
  focusPrev = null
}

// 회의·깜짝 사건이 새로 시작되면 확대한다
function watchMoments(o: Office) {
  const m = o.meeting?.kind ?? null
  // 킥오프(요청마다)·티타임은 너무 잦으니 확대하지 않는다: 계획 회의와 긴급 회의만
  if (m && m !== lastMeeting && (m === 'plan' || m === 'urgent')) zoomFor('meeting')
  lastMeeting = m
  const s = o.surprise?.kind ?? null
  if (s && s !== lastSurprise) zoomFor('surprise')
  lastSurprise = s
  if (zoom && Date.now() > zoom.until) zoom = null
}

function focusPoint(o: Office): { x: number; y: number } {
  const cats = o
    .cats()
    .filter((c: any) => !c.gone)
    .map((c: any) => {
      const u = o.uiOf(c)
      return {
        id: c.id,
        name: c.name,
        x: u.x,
        y: u.y + 6,
        state: c.state,
        working: !!(c.jobs && c.jobs.size),
        sleeping: !c.path?.length && c.pose === 'sleep',
      }
    })
  let want: { x: number; y: number } | null = null
  try {
    want = chooseFocus({
      reason: zoom?.reason ?? null,
      cats,
      planes: o.planes(),
      meeting: o.meeting?.kind ?? null,
      surprise: o.surprise,
      rooms: roomCenters(),
      prev: focusPrev,
    })
  } catch {}
  if (want && Number.isFinite(want.x) && Number.isFinite(want.y)) focusPrev = want
  return focusPrev ?? { x: O.PW / 2, y: O.PH / 2 }
}

function viewNow(o: Office): View {
  // 확대 정도를 목표(0 또는 1) 쪽으로 20%씩 옮긴다 → 스르륵 들어갔다 나온다
  zoomAmt += ((zoom ? 1 : 0) - zoomAmt) * 0.2
  if (Math.abs(zoomAmt) < 0.01) zoomAmt = 0
  if (zoomAmt > 0) {
    const f = focusPoint(o)
    if (!cam.x && !cam.y) cam = { ...f }
    cam = { x: cam.x + (f.x - cam.x) * 0.15, y: cam.y + (f.y - cam.y) * 0.15 }
  } else cam = { x: 0, y: 0 }
  const scale = 1 + zoomAmt * (ZOOM - 1)
  const w = Math.round(O.PW / scale), h = Math.round(O.PH / scale)
  // 전체일 땐 가운데, 확대할수록 카메라 쪽으로
  const cx = O.PW / 2 + ((cam.x || O.PW / 2) - O.PW / 2) * zoomAmt
  const cy = O.PH / 2 + ((cam.y || O.PH / 2) - O.PH / 2) * zoomAmt
  // 정수 px 로 맞춰야 배경 그림이 덜 자주 바뀐다
  let x = Math.round(Math.max(0, Math.min(O.PW - w, cx - w / 2)))
  let y = Math.round(Math.max(0, Math.min(O.PH - h, cy - h / 2)))
  if (cutin) {
    const [sx, sy] = shakeOf(Date.now() - cutin.at)
    x += Math.round(sx)
    y += Math.round(sy)
  }
  return { x, y, w, h }
}

// ── 결정 컷인 ──
// 이 도구들의 결과가 (실패 없이) 돌아오면 "무언가 정해진" 순간이다.
const DECISIONS: [RegExp, string][] = [
  [/^AskUserQuestion$/, 'answer'],
  [/^ExitPlanMode$/, 'plan'],
  [/propose_branch$/, 'branch'],
]
const toolOf = new Map<string, string>() // tool_use id → 도구 이름

function decisionOf(tool: string | undefined): string | null {
  if (!tool) return null
  for (const [re, kind] of DECISIONS) if (re.test(tool)) return kind
  return null
}

function startCutin(kind: string) {
  cutin = { kind, at: Date.now() }
}

const SKY_LINE = (o: Office) => {
  const champ = o.champion()
  const st = o.stats
  const sky = SKY[lightOf(hourNow()).name] || ''
  return `${sky} · 🏆 ${champ ? `${champ.name} ${champ.count}건` : '오늘의 사원 아직 없음'} · 🐟 다음 츄르까지 ${Math.max(0, 12 - st.sinceChuru)}건`
}

// 새 그림을 만들고, 지난번과 다르면 true
function paint(o: Office): boolean {
  watchMoments(o)
  const view = viewNow(o)
  if (cutin && Date.now() - cutin.at > CUTIN_MS) cutin = null
  const overlay = cutin ? cutinSvg(cutin.kind, Date.now() - cutin.at, view) : ''
  const back = backLayerSvg(view)
  const front = frontLayerSvg(o, { todos, hour: hourNow(), view, overlay } as any)
  const head = SKY_LINE(o)
  const sig = logs.length + '|' + (logs[0]?.at ?? '') + (logs[0]?.text ?? '')
  const changed = back !== frame.back || front !== frame.front || head !== frame.head || sig !== frame.sig
  frame = { back, front, head, sig }
  paintedAt = Date.now()
  return changed
}

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
    if (ev.k === 'tool' && ev.id) toolOf.set(String(ev.id), String(ev.tool))
    if (ev.k === 'result' && ev.id) {
      const kind = decisionOf(toolOf.get(String(ev.id)))
      if (kind && !ev.err) startCutin(kind)
      toolOf.delete(String(ev.id))
    }
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
    frame = { back: '', front: '', head: '', sig: '' }
    focusPrev = null
    zoom = null
    zoomAmt = 0
    cutin = null
    toolOf.clear()
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
      // 고양이가 다 졸고 있어서 그림이 똑같으면 패널을 건드리지 않는다
      if (paint(office)) $.ui.invalidate('ui.render')
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
    // 처음 그릴 때, 또는 지난 그림 뒤에 컷인이 시작됐으면 바로 새로 그린다
    if (!frame.front || (cutin && cutin.at >= paintedAt)) paint(o)

    const head = frame.head
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
            {surprise}
          </Box>
          {lines}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {/* 데스크톱 패널은 Svg 두 장을 겹쳐 그리지 못해서(위 장이 안 보임) 한 장으로 합쳐 보낸다 */}
        <T.Svg
          source={frame.back.replace(/<\/svg>$/, '') + frame.front.replace(/^<svg[^>]*>/, '')}
          alt="냥냥 오피스: 도트 고양이들이 Claude의 일을 나눠 하는 사무실"
        />
        <Text>{head}</Text>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {surprise}
        </Box>
        <Box flexDirection="column">{lines}</Box>
      </Box>
    )
  })
}
