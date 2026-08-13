import { useEffect, useMemo, useRef, useState } from 'react'
import { Coins, MousePointer2, RotateCcw, Wind } from 'lucide-react'
import { playSound } from '../game/audio'
import { generateMoment, RIVAL_ATTACKS, USER_MOMENTS, type DefenderSpec, type Moment, type Rival } from '../game/scenarios'

const W = 720
const H = 900
const HORIZON = 236
const GROUND_NEAR = 802
const NEAR_Z = 470
const GOAL_LINE_Z = 55
const FIELD_HALF = 330
const BALL_R = 13
const H_SCALE = 1.28

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (t: number) => t * t * (3 - 2 * t)
const rand = (min: number, max: number) => min + Math.random() * (max - min)
const sign = () => (Math.random() < 0.5 ? -1 : 1)

interface WorldPt {
  x: number
  z: number
}
interface ScreenPt {
  x: number
  y: number
}

const depthFactor = (z: number) => Math.pow(Math.max(z, 4) / NEAR_Z, 0.78)
const scaleAt = (z: number) => 0.52 + 0.48 * depthFactor(z)
const groundY = (z: number) => HORIZON + (GROUND_NEAR - HORIZON) * depthFactor(z)
const screenX = (x: number, z: number) => W / 2 + x * scaleAt(z) * 0.94
const heightPx = (h: number, z: number) => h * scaleAt(z) * H_SCALE
const project = (x: number, z: number, h = 0) => ({
  x: screenX(x, z),
  y: groundY(z) - heightPx(h, z),
  gy: groundY(z),
  s: scaleAt(z),
})

const unproject = (px: number, py: number): WorldPt => {
  const d = clamp((py - HORIZON) / (GROUND_NEAR - HORIZON), 0.002, 1)
  const z = NEAR_Z * Math.pow(d, 1 / 0.78)
  const s = scaleAt(z)
  const x = (px - W / 2) / (s * 0.94)
  return { x: clamp(x, -FIELD_HALF, FIELD_HALF), z: clamp(z, 26, NEAR_Z) }
}

const distance = (a: WorldPt, b: WorldPt) => Math.hypot(a.x - b.x, a.z - b.z)

const chaikin = (points: WorldPt[], passes = 2) => {
  let result = points
  for (let pass = 0; pass < passes; pass += 1) {
    if (result.length < 3) return result
    const next: WorldPt[] = [result[0]]
    for (let index = 0; index < result.length - 1; index += 1) {
      const current = result[index]
      const after = result[index + 1]
      next.push(
        { x: current.x * 0.75 + after.x * 0.25, z: current.z * 0.75 + after.z * 0.25 },
        { x: current.x * 0.25 + after.x * 0.75, z: current.z * 0.25 + after.z * 0.75 },
      )
    }
    next.push(result[result.length - 1])
    result = next
  }
  return result
}

const pathMetrics = (points: WorldPt[]) => {
  const cumulative = [0]
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1], points[index])
    cumulative.push(total)
  }
  return { cumulative, total }
}

const pointAtDistance = (points: WorldPt[], cumulative: number[], target: number) => {
  if (target <= 0) return points[0]
  const total = cumulative[cumulative.length - 1]
  if (target >= total) return points[points.length - 1]
  let index = 1
  while (index < cumulative.length && cumulative[index] < target) index += 1
  const start = points[index - 1]
  const end = points[index]
  const section = cumulative[index] - cumulative[index - 1]
  const ratio = section ? (target - cumulative[index - 1]) / section : 0
  return { x: start.x + (end.x - start.x) * ratio, z: start.z + (end.z - start.z) * ratio }
}

type Phase = 'intro' | 'banner' | 'aim' | 'drawing' | 'flying' | 'postShot' | 'halftime' | 'attack' | 'fulltime'
type Step = { kind: 'moment'; moment: Moment } | { kind: 'attack' } | { kind: 'halftime' }
type ShotOutcome = 'goal' | 'save' | 'block' | 'wall' | 'wide' | 'over' | 'post' | 'short'

export interface MatchResult {
  userGoals: number
  rivalGoals: number
  coinsCollected: number
  won: boolean
}

interface MatchCanvasProps {
  rival: Rival
  kitColor: string
  ballStyle: string
  sound: boolean
  haptics: boolean
  onMatchComplete: (result: MatchResult) => void
}

interface AttackAnim {
  outcome: 'goal' | 'save' | 'wide'
  targetX: number
  x0: number
  applied: boolean
  kicked: boolean
}

interface Confetti {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  color: string
  age: number
}

const THEMES = {
  day: { skyA: '#4db8ea', skyB: '#c6ecf8', sun: '#fff3c0', glow: 'rgba(255,246,214,.55)', grass: ['#1f8f5f', '#1a7a51'], night: false },
  dusk: { skyA: '#2a3470', skyB: '#e0785a', sun: '#ffb45e', glow: 'rgba(255,160,90,.45)', grass: ['#1c7a54', '#176a48'], night: false },
  beach: { skyA: '#3bb3e6', skyB: '#ffe3a4', sun: '#fff3c2', glow: 'rgba(255,240,190,.5)', grass: ['#22a06b', '#1b8a5b'], night: false },
  night: { skyA: '#0a0e2c', skyB: '#27306e', sun: '#eef3ff', glow: 'rgba(190,210,255,.28)', grass: ['#1a6b4d', '#165c42'], night: true },
  gold: { skyA: '#2c2360', skyB: '#e8963f', sun: '#ffd98a', glow: 'rgba(255,210,130,.5)', grass: ['#24905f', '#1e7c52'], night: false },
} as const

const CROWD_COLORS = ['#e2574a', '#f2f4f6', '#2f9fe8', '#f5c542', '#41e4c1', '#846ef1', '#ef6070', '#ff8b3d']

function drawBall(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  style: string,
  rotation = 0,
) {
  context.save()
  context.translate(x, y)
  context.rotate(rotation)
  context.shadowColor = style === 'neon' ? '#41e4c1' : 'rgba(0,0,0,.3)'
  context.shadowBlur = style === 'neon' ? 14 : 7
  context.shadowOffsetY = 3
  const gradient = context.createRadialGradient(-radius * 0.3, -radius * 0.4, 1, 0, 0, radius)
  if (style === 'flame') {
    gradient.addColorStop(0, '#fff5c7')
    gradient.addColorStop(0.5, '#ffb323')
    gradient.addColorStop(1, '#f04e37')
  } else if (style === 'neon') {
    gradient.addColorStop(0, '#ebfffb')
    gradient.addColorStop(0.45, '#41e4c1')
    gradient.addColorStop(1, '#168cbe')
  } else if (style === 'galaxy') {
    gradient.addColorStop(0, '#f5e6ff')
    gradient.addColorStop(0.45, '#a36ef4')
    gradient.addColorStop(1, '#3d2673')
  } else {
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(0.72, '#e5edf1')
    gradient.addColorStop(1, '#aab9c1')
  }
  context.fillStyle = gradient
  context.beginPath()
  context.arc(0, 0, radius, 0, Math.PI * 2)
  context.fill()
  context.shadowColor = 'transparent'
  context.fillStyle = style === 'classic' ? '#132a35' : style === 'flame' ? '#9d251d' : '#ffffffaa'
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2 - Math.PI / 2
    context.beginPath()
    context.arc(Math.cos(angle) * radius * 0.55, Math.sin(angle) * radius * 0.55, radius * 0.2, 0, Math.PI * 2)
    context.fill()
  }
  context.beginPath()
  context.arc(0, 0, radius * 0.25, 0, Math.PI * 2)
  context.fill()
  context.restore()
}

interface PlayerOpts {
  kit: string
  trim?: string
  gloves?: boolean
  facing?: number
  run?: number
  jumpH?: number
  dive?: number
  keeper?: boolean
}

function drawPlayer(context: CanvasRenderingContext2D, x: number, z: number, opts: PlayerOpts) {
  const pr = project(x, z, opts.jumpH ?? 0)
  const s = pr.s
  context.save()
  context.fillStyle = 'rgba(0,18,16,.26)'
  context.beginPath()
  context.ellipse(pr.x, pr.gy + 2, 27 * s, 6 * s, 0, 0, Math.PI * 2)
  context.fill()
  context.translate(pr.x, 0)
  context.scale(opts.facing ?? 1, 1)
  const gy = pr.gy
  const lw = Math.max(2.6, 7 * s)
  context.lineCap = 'round'
  const hipY = gy - 28 * s
  const shoulderY = gy - 53 * s
  const headY = gy - 64 * s
  const swing = Math.sin(opts.run ?? 0)
  const dive = opts.dive ?? 0
  const lean = dive * 14 * s
  context.strokeStyle = opts.trim ?? '#1d2f38'
  context.lineWidth = lw * 0.92
  context.beginPath()
  context.moveTo(0, hipY)
  context.lineTo(-swing * 11 * s, gy)
  context.moveTo(0, hipY)
  context.lineTo(swing * 11 * s, gy)
  context.stroke()
  context.strokeStyle = opts.kit
  context.lineWidth = lw
  context.beginPath()
  context.moveTo(0, hipY)
  context.lineTo(lean, shoulderY)
  context.stroke()
  const armUp = opts.gloves || opts.keeper
  if (armUp) {
    context.strokeStyle = opts.kit
    context.lineWidth = lw * 0.8
    context.beginPath()
    context.moveTo(lean * 0.5, shoulderY + 4 * s)
    context.lineTo(lean * 0.5 - 13 * s, shoulderY - (opts.keeper ? 2 : 10) * s)
    context.moveTo(lean * 0.5, shoulderY + 4 * s)
    context.lineTo(lean * 0.5 + 13 * s, shoulderY - (opts.keeper ? 2 : 10) * s)
    context.stroke()
    if (opts.gloves) {
      context.fillStyle = '#ffd84d'
      context.beginPath()
      context.arc(lean * 0.5 - 13 * s, shoulderY - (opts.keeper ? 2 : 10) * s - 3 * s, 4.5 * s, 0, Math.PI * 2)
      context.arc(lean * 0.5 + 13 * s, shoulderY - (opts.keeper ? 2 : 10) * s - 3 * s, 4.5 * s, 0, Math.PI * 2)
      context.fill()
    }
  } else {
    context.strokeStyle = opts.kit
    context.lineWidth = lw * 0.8
    context.beginPath()
    context.moveTo(0, shoulderY + 4 * s)
    context.lineTo(-10 * s, hipY + 2 * s)
    context.moveTo(0, shoulderY + 4 * s)
    context.lineTo(11 * s, hipY - 2 * s)
    context.stroke()
  }
  context.fillStyle = '#f2aa72'
  context.beginPath()
  context.arc(0, headY + dive * 10 * s, 9.5 * s, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#22303a'
  context.beginPath()
  context.arc(0, headY - 1.5 * s + dive * 10 * s, 9.5 * s, Math.PI, Math.PI * 2)
  context.lineTo(9.5 * s, headY + dive * 10 * s)
  context.arc(0, headY + dive * 10 * s, 9.5 * s, 0, Math.PI * 2)
  context.fill()
  context.restore()
}

function drawCoin(context: CanvasRenderingContext2D, x: number, z: number, time: number, index: number) {
  const pr = project(x, z, 0)
  const float = Math.sin(time * 3 + index) * 5 * pr.s
  const radius = 11 * pr.s
  context.save()
  context.translate(pr.x, pr.y - float)
  context.shadowColor = '#ffcf45'
  context.shadowBlur = 12
  context.fillStyle = '#ffc83e'
  context.beginPath()
  context.arc(0, 0, radius, 0, Math.PI * 2)
  context.fill()
  context.shadowColor = 'transparent'
  context.strokeStyle = '#fff3a8'
  context.lineWidth = 2.5 * pr.s
  context.stroke()
  context.fillStyle = '#9d6d12'
  context.font = `800 ${13 * pr.s}px system-ui`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('K', 0, 1)
  context.restore()
}

export function MatchCanvas({ rival, kitColor, ballStyle, sound, haptics, onMatchComplete }: MatchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef(0)
  const lastFrameRef = useRef(performance.now())
  const propsRef = useRef({ rival, kitColor, ballStyle, sound, haptics })
  propsRef.current = { rival, kitColor, ballStyle, sound, haptics }
  const completeRef = useRef(onMatchComplete)
  completeRef.current = onMatchComplete

  const steps = useMemo<Step[]>(() => {
    const used: Moment['type'][] = []
    const moments = Array.from({ length: USER_MOMENTS }, () => {
      const moment = generateMoment(rival, used)
      used.push(moment.type)
      return moment
    })
    const attackAfter = new Set([0, 1, 3, 4])
    const built: Step[] = []
    moments.forEach((moment, index) => {
      built.push({ kind: 'moment', moment })
      if (attackAfter.has(index)) built.push({ kind: 'attack' })
      if (index === 2) built.push({ kind: 'halftime' })
    })
    return built
  }, [rival])

  const attacks = useMemo<AttackAnim[]>(
    () =>
      Array.from({ length: RIVAL_ATTACKS }, () => {
        const roll = Math.random()
        const outcome: AttackAnim['outcome'] = roll < 0.1 ? 'wide' : roll < 0.1 + rival.shotChance ? 'goal' : 'save'
        const targetX = outcome === 'wide' ? sign() * rand(145, 205) : sign() * rand(30, 130)
        return { outcome, targetX, x0: targetX * 1.15, applied: false, kicked: false }
      }),
    [rival],
  )

  const crowd = useMemo(() => {
    const dots: { x: number; y: number; color: string; phase: number; size: number }[] = []
    for (let row = 0; row < 7; row += 1) {
      const y = 52 + row * 23 + rand(-4, 4)
      for (let x = 4; x < W; x += 9) {
        dots.push({ x: x + rand(-4, 4), y, color: CROWD_COLORS[Math.floor(rand(0, CROWD_COLORS.length))], phase: rand(0, Math.PI * 2), size: rand(2.2, 3.2) })
      }
    }
    return dots
  }, [])

  const [phase, setPhaseState] = useState<Phase>('intro')
  const [stepIndex, setStepIndex] = useState(0)
  const [userGoals, setUserGoals] = useState(0)
  const [rivalGoals, setRivalGoals] = useState(0)
  const [coins, setCoins] = useState(0)
  const [message, setMessage] = useState('')
  const [momentLabel, setMomentLabel] = useState('')
  const [windLabel, setWindLabel] = useState('')
  const [banner, setBanner] = useState<{ text: string; tone: 'gold' | 'red' | 'blue' | 'neutral' } | null>(null)
  const [bannerKey, setBannerKey] = useState(0)

  const phaseRef = useRef<Phase>('intro')
  const phaseStartRef = useRef(performance.now())
  const stepIndexRef = useRef(0)
  const attackIndexRef = useRef(0)
  const momentRef = useRef<Moment | null>(null)
  const momentIndexRef = useRef(0)
  const rawRef = useRef<ScreenPt[]>([])
  const pathRef = useRef<WorldPt[]>([])
  const cumulativeRef = useRef<number[]>([])
  const pathLengthRef = useRef(0)
  const traveledRef = useRef(0)
  const progressRef = useRef(0)
  const ballRef = useRef({ x: 0, z: 0, h: 0 })
  const keeperXRef = useRef(0)
  const arcPeakRef = useRef(100)
  const resolvedRef = useRef<ShotOutcome | null>(null)
  const drawingRef = useRef(false)
  const deflectRef = useRef({ vx: 0, vz: 0 })
  const wallJumpsRef = useRef<{ jump: boolean; t: number; cd: number }[]>([])
  const collectedRef = useRef(new Set<number>())
  const coinsTotalRef = useRef(0)
  const userGoalsRef = useRef(0)
  const rivalGoalsRef = useRef(0)
  const attackRef = useRef<AttackAnim | null>(null)
  const kickAnimRef = useRef(-10)
  const flashRef = useRef(0)
  const shakeRef = useRef(0)
  const exciteRef = useRef(0)
  const confettiRef = useRef<Confetti[]>([])
  const trailRef = useRef<ScreenPt[]>([])
  const zoomRef = useRef(1)
  const finishedRef = useRef(false)
  const decoRef = useRef<{ x: number; z: number; side: 'you' | 'rival' }[]>([])

  const setPhase = (next: Phase) => {
    phaseRef.current = next
    phaseStartRef.current = performance.now()
    setPhaseState(next)
  }

  const showBanner = (text: string, tone: 'gold' | 'red' | 'blue' | 'neutral' = 'neutral') => {
    setBanner({ text, tone })
    setBannerKey((value) => value + 1)
  }

  const vibrate = (pattern: number | number[]) => {
    if (propsRef.current.haptics && 'vibrate' in navigator) navigator.vibrate(pattern)
  }

  const defenderPos = (defender: DefenderSpec, time: number): WorldPt => {
    if (!defender.move) return { x: defender.x, z: defender.z }
    const offset = Math.sin(time * defender.move.speed + defender.move.phase) * defender.move.range
    return {
      x: defender.x + (defender.move.axis === 'x' ? offset : 0),
      z: defender.z + (defender.move.axis === 'z' ? offset : 0),
    }
  }

  const spawnConfetti = (sx: number, sy: number) => {
    const pieces: Confetti[] = []
    for (let index = 0; index < 70; index += 1) {
      pieces.push({
        x: sx + rand(-46, 46),
        y: sy + rand(-20, 12),
        vx: rand(-95, 95),
        vy: rand(-190, -20),
        rot: rand(0, Math.PI * 2),
        vr: rand(-6, 6),
        color: ['#41e4c1', '#ffc83e', '#f45d73', '#ffffff'][Math.floor(rand(0, 4))],
        age: 0,
      })
    }
    confettiRef.current = pieces
  }

  const setupMoment = (moment: Moment) => {
    momentRef.current = moment
    momentIndexRef.current += 1
    ballRef.current = { x: moment.ball.x, z: moment.ball.z, h: 0 }
    keeperXRef.current = 0
    resolvedRef.current = null
    deflectRef.current = { vx: 0, vz: 0 }
    rawRef.current = []
    pathRef.current = []
    cumulativeRef.current = []
    pathLengthRef.current = 0
    traveledRef.current = 0
    progressRef.current = 0
    trailRef.current = []
    attackRef.current = null
    wallJumpsRef.current = moment.defenders.filter((d) => d.wall).map(() => ({ jump: false, t: 0, cd: rand(0, 0.5) }))
    decoRef.current = [
      { x: sign() * rand(150, 260), z: rand(250, 340), side: 'you' },
      { x: sign() * rand(120, 200), z: rand(390, 440), side: 'you' },
      { x: sign() * rand(140, 240), z: rand(140, 230), side: 'rival' },
    ]
    setMomentLabel(moment.label)
    setWindLabel(moment.wind === 0 ? 'Sem vento' : `${moment.wind > 0 ? '→' : '←'} ${Math.round(Math.abs(moment.wind) * 100)} km/h`)
  }

  const resolveShot = (outcome: ShotOutcome, fromX?: number, fromZ?: number) => {
    if (resolvedRef.current) return
    resolvedRef.current = outcome
    const { sound: snd } = propsRef.current
    if (outcome === 'goal') {
      userGoalsRef.current += 1
      setUserGoals(userGoalsRef.current)
      playSound('goal', snd)
      playSound('crowd', snd)
      vibrate([35, 35, 35, 35, 100])
      exciteRef.current = 1.7
      flashRef.current = 1
      const pr = project(0, GOAL_LINE_Z, 40)
      spawnConfetti(pr.x, pr.y)
      showBanner('GOOOOL!', 'gold')
      setMessage('Que pintura! +1 no placar')
    } else {
      setPhase('postShot')
      const dirX = fromX !== undefined ? ballRef.current.x - fromX : -sign()
      const dirZ = fromZ !== undefined ? ballRef.current.z - fromZ : 0
      const norm = Math.max(0.0001, Math.hypot(dirX, dirZ))
      deflectRef.current = { vx: (dirX / norm) * 260, vz: (dirZ / norm) * 200 }
      shakeRef.current = outcome === 'post' ? 0.5 : 0.3
      if (outcome === 'save') {
        playSound('save', snd)
        showBanner('DEFESA DO GOLEIRO!', 'blue')
        setMessage('O goleiro voou no ângulo!')
      } else if (outcome === 'wall') {
        playSound('fail', snd)
        showBanner('A BARREIRA TIROU!', 'red')
        setMessage('Levante mais a bola ou contorne a barreira')
      } else if (outcome === 'block') {
        playSound('fail', snd)
        showBanner('BLOQUEADO!', 'red')
        setMessage('A defesa cortou o chute')
      } else if (outcome === 'post') {
        playSound('fail', snd)
        showBanner('NA TRAVE!', 'red')
        setMessage('Beijou o poste e saiu — quase!')
      } else if (outcome === 'over') {
        playSound('fail', snd)
        showBanner('POR CIMA DO GOL!', 'red')
        setMessage('Termine o traço mais perto da rede')
      } else if (outcome === 'wide') {
        playSound('fail', snd)
        showBanner('PRA FORA!', 'red')
        setMessage('Ajuste a curva para dentro do gol')
      } else {
        playSound('fail', snd)
        showBanner('SEM FORÇA!', 'red')
        setMessage('Desenhe até o fundo da rede')
      }
      vibrate([40, 50, 80])
    }
  }

  const nextStep = () => {
    const next = stepIndexRef.current + 1
    stepIndexRef.current = next
    setStepIndex(next)
    if (next >= steps.length) {
      setPhase('fulltime')
      playSound('whistle', propsRef.current.sound)
      showBanner('FIM DE JOGO', 'neutral')
      setMomentLabel('APITO FINAL')
      return
    }
    const step = steps[next]
    if (step.kind === 'halftime') {
      setPhase('halftime')
      playSound('whistle', propsRef.current.sound)
      showBanner('INTERVALO', 'neutral')
      setMomentLabel('INTERVALO')
    } else if (step.kind === 'attack') {
      const attack = attacks[attackIndexRef.current]
      attackIndexRef.current += 1
      attackRef.current = attack
      keeperXRef.current = 0
      setMomentLabel('ATAQUE DO RIVAL')
      showBanner('RIVAL ATACA!', 'red')
      setPhase('attack')
    } else {
      setupMoment(step.moment)
      showBanner(step.moment.label, 'neutral')
      setPhase('banner')
    }
  }

  const update = (now: number, dt: number) => {
    const time = now / 1000
    const currentPhase = phaseRef.current
    const elapsed = (now - phaseStartRef.current) / 1000
    const moment = momentRef.current
    const { sound: snd, rival: rv } = propsRef.current

    flashRef.current = Math.max(0, flashRef.current - dt * 1.6)
    shakeRef.current = Math.max(0, shakeRef.current - dt * 2.2)
    exciteRef.current = Math.max(0, exciteRef.current - dt)
    const zoomTarget = currentPhase === 'flying' ? 1 + 0.07 * smooth(clamp((progressRef.current - 0.55) / 0.3, 0, 1)) : 1
    zoomRef.current = lerp(zoomRef.current, zoomTarget, 0.09)

    if (currentPhase === 'intro') {
      if (elapsed > 2.1) nextStep()
      return
    }
    if (currentPhase === 'banner') {
      if (elapsed > 1.0) {
        setPhase('aim')
        setBanner(null)
        setMessage('Arraste a partir da bola para desenhar o chute')
      }
      return
    }
    if (currentPhase === 'halftime') {
      if (elapsed > 2.4) nextStep()
      return
    }
    if (currentPhase === 'fulltime') {
      if (elapsed > 1.7 && !finishedRef.current) {
        finishedRef.current = true
        completeRef.current({
          userGoals: userGoalsRef.current,
          rivalGoals: rivalGoalsRef.current,
          coinsCollected: coinsTotalRef.current,
          won: userGoalsRef.current > rivalGoalsRef.current,
        })
      }
      return
    }

    if (currentPhase === 'postShot') {
      if (resolvedRef.current === 'goal') return
      ballRef.current.x += deflectRef.current.vx * dt
      ballRef.current.z += deflectRef.current.vz * dt
      ballRef.current.h = Math.max(0, ballRef.current.h - 110 * dt)
      if (elapsed > 1.3) nextStep()
      return
    }

    if (currentPhase === 'attack') {
      const attack = attackRef.current
      if (!attack) return
      if (elapsed < 0.9) {
        const runT = elapsed / 0.9
        ballRef.current = { x: lerp(attack.x0, attack.x0 * 0.94, runT), z: lerp(430, 336, runT), h: 0 }
        keeperXRef.current = lerp(0, attack.targetX * (attack.outcome === 'save' ? 0.55 : -0.2), runT * 0.4)
      } else if (elapsed < 1.1) {
        if (!attack.kicked) {
          attack.kicked = true
          playSound('kick', snd)
        }
      } else {
        const p = Math.min(1, (elapsed - 1.1) / 0.95)
        const z = 336 - p * 295
        const x = attack.x0 - p * (attack.x0 - attack.targetX)
        ballRef.current = { x, z, h: 62 * Math.sin(Math.PI * p) }
        const kp = smooth(clamp((elapsed - 1.4) / 0.5, 0, 1))
        keeperXRef.current = attack.targetX * (attack.outcome === 'save' ? 0.95 * kp : -0.3 * kp)
        if (p >= 1 && !attack.applied) {
          attack.applied = true
          if (attack.outcome === 'goal') {
            rivalGoalsRef.current += 1
            setRivalGoals(rivalGoalsRef.current)
            playSound('fail', snd)
            playSound('crowd', snd)
            vibrate([60, 40, 60])
            exciteRef.current = 1.5
            showBanner('GOL DO RIVAL!', 'red')
            setMessage('O adversário empatou o jogo')
          } else if (attack.outcome === 'save') {
            playSound('save', snd)
            showBanner('SEU GOLEIRO DEFENDEU!', 'blue')
            setMessage('Defesaça do seu goleiro!')
          } else {
            playSound('save', snd)
            showBanner('CHUTOU PRA FORA!', 'blue')
            setMessage('O rival mandou pra fora — sorte sua!')
          }
        }
        if (attack.applied && attack.outcome === 'save') {
          ballRef.current.x += (elapsed - 2.1) * 240 * (attack.targetX >= 0 ? 1 : -1)
          ballRef.current.h = Math.max(0, ballRef.current.h - 130 * dt * 4)
        }
      }
      if (elapsed > 3.4) nextStep()
      return
    }

    if (currentPhase === 'flying' && moment) {
      const pathLength = pathLengthRef.current
      const speed = pathLength / (1.02 + rv.keeperSkill * 0.4)
      const p = progressRef.current
      const timeScale = p < 0.5 ? 1 : lerp(1, 0.22, smooth(clamp((p - 0.5) / 0.35, 0, 1)))
      traveledRef.current += dt * speed * timeScale
      const nextP = Math.min(1, traveledRef.current / pathLength)
      progressRef.current = nextP
      const base = pointAtDistance(pathRef.current, cumulativeRef.current, Math.min(traveledRef.current, pathLength))
      const height = arcPeakRef.current * Math.pow(Math.sin(Math.PI * Math.min(nextP, 1)), 0.42)
      const windOffset = moment.wind * Math.sin(Math.PI * nextP) * pathLength * 0.16
      const ball = { x: base.x + windOffset, z: base.z, h: height }
      ballRef.current = ball

      const ballScreen = project(ball.x, ball.z, ball.h)
      trailRef.current.push({ x: ballScreen.x, y: ballScreen.y })
      if (trailRef.current.length > 16) trailRef.current.shift()

      moment.coins.forEach((coin, index) => {
        const key = momentIndexRef.current * 100 + index
        if (!collectedRef.current.has(key) && distance(ball, coin) < 30) {
          collectedRef.current.add(key)
          coinsTotalRef.current += 1
          setCoins(coinsTotalRef.current)
          playSound('coin', snd)
        }
      })

      if (!resolvedRef.current) {
        let wallIndex = 0
        for (const defender of moment.defenders) {
          const pos = defenderPos(defender, time)
          if (defender.wall) {
            const state = wallJumpsRef.current[wallIndex]
            if (state) {
              const dist = distance(ball, pos)
              if (!state.jump && state.cd <= 0 && dist < 115) {
                state.jump = true
                state.t = 0
              }
              if (state.jump) {
                state.t += dt
                if (state.t > 0.6) {
                  state.jump = false
                  state.cd = 0.5
                }
              } else {
                state.cd -= dt
              }
              const wallH = 34 + (state.jump ? 54 * Math.sin(Math.PI * Math.min(1, state.t / 0.6)) : 0)
              if (dist < defender.radius + BALL_R - 2 && ball.h < wallH + 10) {
                resolveShot('wall', pos.x, pos.z)
                break
              }
            }
            wallIndex += 1
          } else if (distance(ball, pos) < defender.radius + BALL_R - 2 && ball.h < 44) {
            resolveShot('block', pos.x, pos.z)
            break
          }
        }
      }

      if (!resolvedRef.current && moment.keeper.z > 70 && Math.abs(ball.z - moment.keeper.z) < 14 && ball.h < moment.keeper.reachH) {
        const chase = ball.x
        keeperXRef.current = clamp(keeperXRef.current + clamp(chase - keeperXRef.current, -moment.keeper.speed * dt * 2, moment.keeper.speed * dt * 2), -FIELD_HALF, FIELD_HALF)
        if (Math.abs(ball.x - keeperXRef.current) < moment.keeper.reach * 0.8) {
          resolveShot('save', keeperXRef.current, moment.keeper.z)
        }
      }

      if (!resolvedRef.current && Math.abs(ball.x) > FIELD_HALF - 4) {
        resolveShot('wide', ball.x > 0 ? FIELD_HALF : -FIELD_HALF, ball.z)
      }

      if (!resolvedRef.current && ball.z <= GOAL_LINE_Z + 2) {
        const endX = pathRef.current[pathRef.current.length - 1].x + moment.wind * pathLength * 0.16
        const target = endX * (0.45 + moment.keeper.skill * 0.55) + moment.keeper.guess
        keeperXRef.current = clamp(keeperXRef.current + clamp(target - keeperXRef.current, -moment.keeper.speed * dt, moment.keeper.speed * dt), -FIELD_HALF, FIELD_HALF)
        const gx = ball.x
        if (Math.abs(Math.abs(gx) - moment.goalHalf) < 5.5) resolveShot('post')
        else if (ball.h > moment.crossbar + 6) resolveShot('over')
        else if (Math.abs(gx) > moment.goalHalf + 5.5) resolveShot('wide', gx > 0 ? FIELD_HALF : -FIELD_HALF, ball.z)
        else if (Math.abs(gx - keeperXRef.current) < moment.keeper.reach && ball.h < moment.keeper.reachH) {
          resolveShot('save', keeperXRef.current, moment.keeper.z)
        } else resolveShot('goal')
      } else if (!resolvedRef.current) {
        const endX = pathRef.current[pathRef.current.length - 1].x + moment.wind * pathLength * 0.16
        const target = endX * (0.45 + moment.keeper.skill * 0.55) + moment.keeper.guess
        keeperXRef.current = clamp(keeperXRef.current + clamp(target - keeperXRef.current, -moment.keeper.speed * dt, moment.keeper.speed * dt), -FIELD_HALF, FIELD_HALF)
      }

      if (resolvedRef.current === 'goal' && (nextP >= 1 || ball.z <= 18)) {
        ballRef.current = { x: ball.x, z: Math.max(ball.z, 16), h: Math.max(0, ball.h - 30) }
        setPhase('postShot')
      } else if (resolvedRef.current && resolvedRef.current !== 'goal') {
        // already transitioned inside resolveShot
      } else if (nextP >= 1 && !resolvedRef.current) {
        resolveShot('short')
      }
    }
  }

  const render = (context: CanvasRenderingContext2D, now: number, dpr: number) => {
    const time = now / 1000
    const { rival: rv, ballStyle: style, kitColor } = propsRef.current
    const theme = THEMES[rv.theme]
    const moment = momentRef.current
    const currentPhase = phaseRef.current
    const excite = exciteRef.current

    const ballScreen = project(ballRef.current.x, ballRef.current.z, ballRef.current.h)
    const zoom = zoomRef.current
    const shake = shakeRef.current
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.translate(Math.sin(now / 7.3) * 6 * shake, Math.cos(now / 6.1) * 5 * shake)
    context.translate(ballScreen.x, ballScreen.y)
    context.scale(zoom, zoom)
    context.translate(-ballScreen.x, -ballScreen.y)

    // Sky
    const sky = context.createLinearGradient(0, -420, 0, H + 420)
    sky.addColorStop(0, theme.skyA)
    sky.addColorStop(0.62, theme.skyB)
    sky.addColorStop(0.9, '#0c2a26')
    sky.addColorStop(1, '#071a18')
    context.fillStyle = sky
    context.fillRect(-420, -420, W + 840, H + 840)

    if (theme.night) {
      context.fillStyle = 'rgba(255,255,255,.8)'
      for (let index = 0; index < 46; index += 1) {
        const sx = (index * 173) % W
        const sy = 24 + ((index * 97) % 150)
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.5 + index))
        context.globalAlpha = tw
        context.beginPath()
        context.arc(sx, sy, 1.3, 0, Math.PI * 2)
        context.fill()
      }
      context.globalAlpha = 1
      context.fillStyle = theme.sun
      context.beginPath()
      context.arc(600, 74, 22, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = theme.skyA
      context.beginPath()
      context.arc(608, 68, 20, 0, Math.PI * 2)
      context.fill()
    } else {
      const sunX = rv.theme === 'gold' ? 360 : 540
      const sunY = rv.theme === 'gold' ? 96 : rv.theme === 'dusk' ? 150 : 72
      const sunR = rv.theme === 'gold' ? 46 : 30
      const sunGlow = context.createRadialGradient(sunX, sunY, 4, sunX, sunY, sunR * 3.2)
      sunGlow.addColorStop(0, theme.glow)
      sunGlow.addColorStop(1, 'rgba(255,255,255,0)')
      context.fillStyle = sunGlow
      context.beginPath()
      context.arc(sunX, sunY, sunR * 3.2, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = theme.sun
      context.beginPath()
      context.arc(sunX, sunY, sunR, 0, Math.PI * 2)
      context.fill()
    }

    context.fillStyle = 'rgba(255,255,255,.16)'
    for (let index = 0; index < 4; index += 1) {
      const cx = ((time * 9 + index * 231) % (W + 240)) - 120
      const cy = 60 + index * 34
      context.beginPath()
      context.ellipse(cx, cy, 52, 12, 0, 0, Math.PI * 2)
      context.fill()
    }

    // Stadium roof + stands + crowd
    const roof = context.createLinearGradient(0, 0, 0, 52)
    roof.addColorStop(0, '#0b1726')
    roof.addColorStop(1, '#16283c')
    context.fillStyle = roof
    context.fillRect(-420, -6, W + 840, 50)
    context.fillStyle = 'rgba(255,255,255,.08)'
    context.fillRect(-420, 44, W + 840, 4)
    const stands = context.createLinearGradient(0, 48, 0, HORIZON + 8)
    stands.addColorStop(0, '#203347')
    stands.addColorStop(1, '#0e2233')
    context.fillStyle = stands
    context.fillRect(-420, 48, W + 840, HORIZON - 40)
    crowd.forEach((dot) => {
      const bounce = Math.sin(time * (10 + dot.phase) + dot.phase) * (0.6 + excite * 4.5)
      context.fillStyle = dot.color
      context.globalAlpha = 0.62 + 0.38 * Math.abs(Math.sin(time * 2 + dot.phase))
      context.beginPath()
      context.arc(dot.x, dot.y + bounce, dot.size, 0, Math.PI * 2)
      context.fill()
    })
    context.globalAlpha = 1
    context.fillStyle = 'rgba(4,14,22,.55)'
    context.fillRect(-420, HORIZON - 6, W + 840, 18)
    context.fillStyle = 'rgba(65,228,193,.28)'
    context.fillRect(-420, HORIZON + 8, W + 840, 3)

    if (theme.night) {
      for (const fx of [110, 610]) {
        context.strokeStyle = '#16283c'
        context.lineWidth = 5
        context.beginPath()
        context.moveTo(fx, -6)
        context.lineTo(fx, 96)
        context.stroke()
        context.fillStyle = '#1b3149'
        context.fillRect(fx - 26, 88, 52, 16)
        context.fillStyle = '#fff7d6'
        for (let l = 0; l < 3; l += 1) context.fillRect(fx - 22 + l * 16, 82, 10, 8)
        const beam = context.createLinearGradient(fx, 96, 360, 420)
        beam.addColorStop(0, 'rgba(255,250,220,.16)')
        beam.addColorStop(1, 'rgba(255,250,220,0)')
        context.fillStyle = beam
        context.beginPath()
        context.moveTo(fx - 18, 96)
        context.lineTo(fx + 18, 96)
        context.lineTo(360 + (fx === 110 ? -260 : 260), 470)
        context.lineTo(360 + (fx === 110 ? -360 : 360), 470)
        context.closePath()
        context.fill()
      }
    }

    // Pitch
    const pitchTop = groundY(GOAL_LINE_Z)
    const pitchBottom = groundY(NEAR_Z)
    const field = context.createLinearGradient(0, pitchTop, 0, pitchBottom)
    field.addColorStop(0, theme.grass[1])
    field.addColorStop(1, theme.grass[0])
    context.fillStyle = field
    context.beginPath()
    context.moveTo(screenX(-FIELD_HALF, GOAL_LINE_Z), pitchTop)
    context.lineTo(screenX(FIELD_HALF, GOAL_LINE_Z), pitchTop)
    context.lineTo(screenX(FIELD_HALF, NEAR_Z), pitchBottom)
    context.lineTo(screenX(-FIELD_HALF, NEAR_Z), pitchBottom)
    context.closePath()
    context.fill()
    for (let band = 0; band < 9; band += 1) {
      const z0 = GOAL_LINE_Z + ((NEAR_Z - GOAL_LINE_Z) / 9) * band
      const z1 = GOAL_LINE_Z + ((NEAR_Z - GOAL_LINE_Z) / 9) * (band + 1)
      context.fillStyle = band % 2 ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.05)'
      context.beginPath()
      context.moveTo(screenX(-FIELD_HALF, z0), groundY(z0))
      context.lineTo(screenX(FIELD_HALF, z0), groundY(z0))
      context.lineTo(screenX(FIELD_HALF, z1), groundY(z1))
      context.lineTo(screenX(-FIELD_HALF, z1), groundY(z1))
      context.closePath()
      context.fill()
    }

    const line = (points: WorldPt[], width = 3.2, alpha = 0.75, color = 'rgba(255,255,255,.92)') => {
      context.strokeStyle = color
      context.lineWidth = width
      context.globalAlpha = alpha
      context.beginPath()
      points.forEach((p, index) => {
        const pr = project(p.x, p.z, 0)
        if (index === 0) context.moveTo(pr.x, pr.y)
        else context.lineTo(pr.x, pr.y)
      })
      context.stroke()
      context.globalAlpha = 1
    }
    line([{ x: -FIELD_HALF, z: GOAL_LINE_Z }, { x: FIELD_HALF, z: GOAL_LINE_Z }])
    line([{ x: -FIELD_HALF, z: GOAL_LINE_Z }, { x: -FIELD_HALF, z: NEAR_Z }])
    line([{ x: FIELD_HALF, z: GOAL_LINE_Z }, { x: FIELD_HALF, z: NEAR_Z }])
    line([{ x: -FIELD_HALF, z: NEAR_Z }, { x: FIELD_HALF, z: NEAR_Z }], 3.2, 0.35)
    line([{ x: -200, z: GOAL_LINE_Z }, { x: -200, z: 175 }, { x: 200, z: 175 }, { x: 200, z: GOAL_LINE_Z }])
    line([{ x: -95, z: GOAL_LINE_Z }, { x: -95, z: 105 }, { x: 95, z: 105 }, { x: 95, z: GOAL_LINE_Z }])
    line([{ x: -FIELD_HALF, z: 262 }, { x: FIELD_HALF, z: 262 }])
    const circlePoints = Array.from({ length: 44 }, (_, index) => {
      const angle = (index / 44) * Math.PI * 2
      return { x: Math.cos(angle) * 80, z: 262 + Math.sin(angle) * 80 }
    })
    line(circlePoints)
    const spot = project(0, 262, 0)
    context.fillStyle = 'rgba(255,255,255,.9)'
    context.beginPath()
    context.arc(spot.x, spot.y, 3, 0, Math.PI * 2)
    context.fill()
    const penaltySpot = project(0, 155, 0)
    context.beginPath()
    context.arc(penaltySpot.x, penaltySpot.y, 3, 0, Math.PI * 2)
    context.fill()

    // Goal
    const goalHalf = moment?.goalHalf ?? 135
    const crossbarH = moment?.crossbar ?? 75
    {
      const front = {
        lx: screenX(-goalHalf, GOAL_LINE_Z),
        rx: screenX(goalHalf, GOAL_LINE_Z),
        topY: groundY(GOAL_LINE_Z) - heightPx(crossbarH, GOAL_LINE_Z),
        by: groundY(GOAL_LINE_Z),
      }
      const back = {
        lx: screenX(-goalHalf, GOAL_LINE_Z - 30),
        rx: screenX(goalHalf, GOAL_LINE_Z - 30),
        topY: groundY(GOAL_LINE_Z - 30) - heightPx(crossbarH, GOAL_LINE_Z - 30),
        by: groundY(GOAL_LINE_Z - 30),
      }
      context.fillStyle = 'rgba(240,248,252,.13)'
      context.fillRect(back.lx, back.topY, back.rx - back.lx, back.by - back.topY)
      context.strokeStyle = 'rgba(240,248,252,.22)'
      context.lineWidth = 1
      for (let index = 0; index <= 8; index += 1) {
        const fx = lerp(front.lx, front.rx, index / 8)
        const bx = lerp(back.lx, back.rx, index / 8)
        context.beginPath()
        context.moveTo(fx, front.by)
        context.lineTo(bx, back.by)
        context.moveTo(fx, front.topY)
        context.lineTo(bx, back.topY)
        context.stroke()
      }
      for (let index = 0; index <= 4; index += 1) {
        const fy = lerp(front.by, front.topY, index / 4)
        const bby = lerp(back.by, back.topY, index / 4)
        context.beginPath()
        context.moveTo(front.lx, fy)
        context.lineTo(front.rx, fy)
        context.moveTo(back.lx, bby)
        context.lineTo(back.rx, bby)
        context.stroke()
      }
      context.strokeStyle = 'rgba(200,220,224,.75)'
      context.lineWidth = 3
      context.strokeRect(back.lx, back.topY, back.rx - back.lx, back.by - back.topY)
      context.strokeStyle = '#f4ffff'
      context.lineWidth = 6
      context.lineCap = 'round'
      context.shadowColor = 'rgba(0,0,0,.3)'
      context.shadowBlur = 8
      context.beginPath()
      context.moveTo(front.lx, front.by)
      context.lineTo(front.lx, front.topY)
      context.lineTo(front.rx, front.topY)
      context.lineTo(front.rx, front.by)
      context.stroke()
      context.shadowColor = 'transparent'
      context.lineCap = 'butt'
      context.fillStyle = 'rgba(255,255,255,.5)'
      context.fillRect(front.lx - 3, front.topY, 6, 10)
      context.fillRect(front.rx - 3, front.topY, 6, 10)
    }

    // Corner flags
    for (const side of [-1, 1]) {
      const pr = project(side * FIELD_HALF, GOAL_LINE_Z, 0)
      context.strokeStyle = '#e8f4f2'
      context.lineWidth = 2
      context.beginPath()
      context.moveTo(pr.x, pr.y)
      context.lineTo(pr.x, pr.y - 22 * pr.s)
      context.stroke()
      context.fillStyle = '#ffc946'
      context.beginPath()
      context.moveTo(pr.x, pr.y - 22 * pr.s)
      context.lineTo(pr.x + 12 * pr.s, pr.y - 17 * pr.s)
      context.lineTo(pr.x, pr.y - 12 * pr.s)
      context.closePath()
      context.fill()
    }

    // Ad boards (near camera edge)
    const boardsY = groundY(NEAR_Z) + 6
    context.fillStyle = '#0a1b22'
    context.fillRect(-420, boardsY, W + 840, H - boardsY + 420)
    context.strokeStyle = 'rgba(255,255,255,.1)'
    context.lineWidth = 1
    context.strokeRect(-420, boardsY, W + 840, 3)
    context.fillStyle = rv.kit
    context.fillRect(-420, boardsY, W + 840, 22)
    context.fillStyle = 'rgba(6,20,26,.85)'
    context.fillRect(-420, boardsY + 22, W + 840, 34)
    context.fillStyle = 'rgba(120,240,220,.55)'
    context.font = '700 17px "Barlow Condensed", sans-serif'
    context.textBaseline = 'middle'
    const adOffset = -((now * 46) % 480)
    for (let index = 0; index < 3; index += 1) {
      context.fillText('FUTEBOLISTA KICK  •  JOGUE A PARTIDA  •', adOffset + index * 480, boardsY + 40)
    }

    // Coins
    if (moment) {
      moment.coins.forEach((coin, index) => {
        const key = momentIndexRef.current * 100 + index
        if (!collectedRef.current.has(key)) drawCoin(context, coin.x, coin.z, time, index)
      })
    }

    // Trajectory
    const drawingNow = currentPhase === 'drawing'
    const showPath = drawingNow || currentPhase === 'flying' || (currentPhase === 'postShot' && resolvedRef.current === 'goal')
    if (showPath && (drawingNow ? rawRef.current.length > 1 : pathRef.current.length > 1)) {
      context.save()
      context.strokeStyle = '#d9fff7'
      context.shadowColor = '#28e1c0'
      context.shadowBlur = 13
      context.lineWidth = 6
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.setLineDash([15, 11])
      context.lineDashOffset = -time * 90
      context.beginPath()
      if (drawingNow) {
        rawRef.current.forEach((p, index) => {
          if (index === 0) context.moveTo(p.x, p.y)
          else context.lineTo(p.x, p.y)
        })
      } else {
        pathRef.current.forEach((p, index) => {
          const pr = project(p.x, p.z, 0)
          if (index === 0) context.moveTo(pr.x, pr.y)
          else context.lineTo(pr.x, pr.y)
        })
      }
      context.stroke()
      context.restore()
    }

    // Ball trail
    trailRef.current.forEach((trail, index) => {
      const alpha = (index + 1) / trailRef.current.length
      context.fillStyle = `rgba(69, 235, 202, ${alpha * 0.22})`
      context.beginPath()
      context.arc(trail.x, trail.y, 3 + alpha * 4, 0, Math.PI * 2)
      context.fill()
    })

    // Players
    const players: { x: number; z: number; opts: PlayerOpts; zKey: number }[] = []
    const isAttack = currentPhase === 'attack'
    if (moment && !isAttack) {
      players.push({
        x: keeperXRef.current,
        z: moment.keeper.z,
        opts: { kit: rv.kit, trim: rv.kitDark, gloves: true, keeper: true, facing: 1 },
        zKey: moment.keeper.z,
      })
      let wallIndex = 0
      moment.defenders.forEach((defender) => {
        const pos = defenderPos(defender, time)
        let jumpH = 0
        if (defender.wall) {
          const state = wallJumpsRef.current[wallIndex]
          wallIndex += 1
          if (state?.jump) jumpH = 54 * Math.sin(Math.PI * Math.min(1, state.t / 0.6))
        }
        players.push({
          x: pos.x,
          z: pos.z,
          opts: {
            kit: rv.kit,
            trim: rv.kitDark,
            facing: Math.sin(time * 1.4 + defender.x) > 0 ? 1 : -1,
            run: time * 6 + defender.x,
            jumpH,
          },
          zKey: pos.z,
        })
      })
    }
    decoRef.current.forEach((deco) => {
      players.push({
        x: deco.x,
        z: deco.z,
        opts: { kit: deco.side === 'you' ? kitColor : rv.kit, trim: deco.side === 'you' ? '#17323c' : rv.kitDark, run: time * 4, facing: 1 },
        zKey: deco.z,
      })
    })
    if (moment && !isAttack) {
      const kickSwing = Math.min(1, Math.max(0, (now - kickAnimRef.current) / 260))
      players.push({
        x: moment.ball.x + 26,
        z: moment.ball.z + 34,
        opts: { kit: kitColor, trim: '#17323c', facing: -1, run: kickSwing * 5 },
        zKey: moment.ball.z + 34,
      })
    }
    if (isAttack && attackRef.current) {
      const attack = attackRef.current
      const elapsed = (now - phaseStartRef.current) / 1000
      const strikerZ = elapsed < 0.9 ? lerp(430, 336, elapsed / 0.9) : 336
      players.push({
        x: attack.x0 * 0.95,
        z: strikerZ,
        opts: { kit: rv.kit, trim: rv.kitDark, facing: -1, run: elapsed < 0.9 ? elapsed * 12 : 0 },
        zKey: strikerZ,
      })
      players.push({
        x: keeperXRef.current,
        z: 62,
        opts: {
          kit: kitColor,
          trim: '#17323c',
          gloves: true,
          keeper: true,
          facing: 1,
          dive: elapsed > 1.35 ? smooth(clamp((elapsed - 1.35) / 0.4, 0, 1)) : 0,
        },
        zKey: 62,
      })
    }
    players.sort((a, b) => b.zKey - a.zKey)
    players.forEach((player) => drawPlayer(context, player.x, player.z, player.opts))

    // Ball
    const ball = ballRef.current
    const ballPr = project(ball.x, ball.z, ball.h)
    if (ball.h > 4) {
      context.fillStyle = 'rgba(0,16,14,.22)'
      context.beginPath()
      context.ellipse(ballPr.x, ballPr.gy + 2, 11 * ballPr.s * (1 - ball.h / 260), 3.6 * ballPr.s, 0, 0, Math.PI * 2)
      context.fill()
    }
    const rotation = currentPhase === 'flying' ? traveledRef.current / 20 : time * 1.5
    drawBall(context, ballPr.x, ballPr.y, BALL_R * ballPr.s * 1.04, style, rotation)

    // Confetti
    if (confettiRef.current.length) {
      confettiRef.current.forEach((piece) => {
        piece.age += 1 / 60
        piece.vy += 300 / 60
        piece.x += (piece.vx / 60) * 2.2
        piece.y += (piece.vy / 60) * 2.2
        piece.rot += piece.vr / 60
        if (piece.age > 2) return
        context.save()
        context.translate(piece.x, piece.y)
        context.rotate(piece.rot)
        context.globalAlpha = Math.max(0, 1 - piece.age / 2)
        context.fillStyle = piece.color
        context.fillRect(-4, -8, 8, 15)
        context.restore()
      })
      context.globalAlpha = 1
      confettiRef.current = confettiRef.current.filter((piece) => piece.age <= 2)
    }

    // Goal flash
    if (flashRef.current > 0 && moment) {
      const pr = project(0, GOAL_LINE_Z, 40)
      const glow = context.createRadialGradient(pr.x, pr.y, 6, pr.x, pr.y, 190)
      glow.addColorStop(0, `rgba(255,255,255,${0.75 * flashRef.current})`)
      glow.addColorStop(1, 'rgba(255,255,255,0)')
      context.fillStyle = glow
      context.beginPath()
      context.arc(pr.x, pr.y, 190, 0, Math.PI * 2)
      context.fill()
    }

    // Slow-motion vignette
    if (zoom > 1.005) {
      const vig = context.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72)
      vig.addColorStop(0, 'rgba(3,10,16,0)')
      vig.addColorStop(1, `rgba(3,10,16,${0.3 * (zoom - 1) / 0.07})`)
      context.fillStyle = vig
      context.fillRect(-420, -420, W + 840, H + 840)
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = W * dpr
    canvas.height = H * dpr
    const context = canvas.getContext('2d')
    if (!context) return
    playSound('whistle', propsRef.current.sound)
    showBanner(`${rival.name.toUpperCase()} • ${rival.tier.toUpperCase()}`, 'neutral')
    setMessage('Apito inicial! Prepare o traço')
    const frame = (now: number) => {
      const delta = Math.min((now - lastFrameRef.current) / 1000, 0.034)
      lastFrameRef.current = now
      update(now, delta)
      render(context, now, dpr)
      animationRef.current = requestAnimationFrame(frame)
    }
    animationRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(animationRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>): ScreenPt => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * W,
      y: ((event.clientY - bounds.top) / bounds.height) * H,
    }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== 'aim' || !momentRef.current) return
    const point = canvasPoint(event)
    const ballScreen = project(momentRef.current.ball.x, momentRef.current.ball.z, 0)
    if (Math.hypot(point.x - ballScreen.x, point.y - ballScreen.y) > 120) {
      setMessage('Comece o traço em cima da bola')
      vibrate(20)
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingRef.current = true
    rawRef.current = [point]
    setPhase('drawing')
    setBanner(null)
    setMessage('Curve o traço e solte para chutar')
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || phaseRef.current !== 'drawing') return
    const point = canvasPoint(event)
    const last = rawRef.current[rawRef.current.length - 1]
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= 7) {
      if (rawRef.current.length < 220) rawRef.current.push(point)
    }
  }

  const launch = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || phaseRef.current !== 'drawing' || !momentRef.current) return
    drawingRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const moment = momentRef.current
    const raw = rawRef.current
    if (raw.length < 5) {
      rawRef.current = []
      setPhase('aim')
      setMessage('Trace um caminho mais longo em direção ao gol')
      return
    }
    const world = raw.map((p) => unproject(p.x, p.y))
    const smoothed = chaikin(world, 2)
    const metrics = pathMetrics(smoothed)
    if (metrics.total < moment.minPath) {
      rawRef.current = []
      setPhase('aim')
      setMessage('Trace um caminho mais longo até o gol')
      return
    }
    const end = smoothed[smoothed.length - 1]
    if (end.z > 64) {
      rawRef.current = []
      setPhase('aim')
      setMessage('Termine o traço dentro do gol')
      return
    }
    pathRef.current = smoothed
    cumulativeRef.current = metrics.cumulative
    pathLengthRef.current = metrics.total
    traveledRef.current = 0
    progressRef.current = 0
    arcPeakRef.current = clamp((metrics.total / 600) * 100 + 38, 52, 155)
    kickAnimRef.current = performance.now()
    playSound('kick', propsRef.current.sound)
    vibrate(28)
    setPhase('flying')
    setMessage('Bola em movimento!')
  }

  const minute = Math.min(90, 3 + stepIndex * 8 + (phase === 'attack' ? 4 : 0))
  const secondHalf = stepIndex >= 5

  return (
    <div className="match-stage">
      <div className="match-scoreboard">
        <div className="sb-team you">
          <span className="sb-dot" style={{ background: kitColor }} />
          <div>
            <small>VOCÊ</small>
            <b>{userGoals}</b>
          </div>
        </div>
        <div className="sb-clock">
          <b>{minute}'</b>
          <small>{secondHalf ? '2º TEMPO' : '1º TEMPO'}</small>
        </div>
        <div className="sb-team rival">
          <div>
            <small>{rival.short}</small>
            <b>{rivalGoals}</b>
          </div>
          <span className="sb-dot" style={{ background: rival.kit }} />
        </div>
      </div>
      <div className="match-canvas-wrap">
        <canvas
          ref={canvasRef}
          className={`match-canvas phase-${phase}`}
          aria-label="Partida de futebol em perspectiva. Arraste a partir da bola para desenhar o chute."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={launch}
          onPointerCancel={launch}
        />
        <div className="moment-pill">{momentLabel}</div>
        <div className="match-coins">
          <Coins size={15} />
          <b>{coins}</b>
        </div>
        <div className="wind-chip" title="Força do vento">
          <Wind size={15} />
          <span>{windLabel}</span>
        </div>
        {banner && (
          <div key={bannerKey} className={`match-banner ${banner.tone}`}>
            <span>{banner.text}</span>
          </div>
        )}
        <div className={`game-callout ${phase}`}>
          {(phase === 'aim' || phase === 'drawing') && <MousePointer2 size={18} />}
          {phase === 'postShot' && <RotateCcw size={18} />}
          <span>{message}</span>
        </div>
      </div>
    </div>
  )
}
