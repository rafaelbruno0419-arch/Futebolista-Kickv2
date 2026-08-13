export type StadiumTheme = 'day' | 'dusk' | 'beach' | 'night' | 'gold'

export interface Rival {
  id: string
  name: string
  short: string
  tier: string
  unlockWins: number
  kit: string
  kitDark: string
  accent: string
  theme: StadiumTheme
  keeperSkill: number
  shotChance: number
  winReward: number
}

export const RIVALS: Rival[] = [
  {
    id: 'varzea',
    name: 'Várzea FC',
    short: 'VAR',
    tier: 'Amadores',
    unlockWins: 0,
    kit: '#e2574a',
    kitDark: '#9c2f27',
    accent: '#ffd9d0',
    theme: 'day',
    keeperSkill: 0.22,
    shotChance: 0.2,
    winReward: 120,
  },
  {
    id: 'coelho',
    name: 'Coelho Atlético',
    short: 'COE',
    tier: 'Intermunicipal',
    unlockWins: 2,
    kit: '#f2f4f6',
    kitDark: '#aebac2',
    accent: '#e2ecf2',
    theme: 'dusk',
    keeperSkill: 0.4,
    shotChance: 0.3,
    winReward: 180,
  },
  {
    id: 'tubaroes',
    name: 'Tubarões do Litoral',
    short: 'TUB',
    tier: 'Copa Litoral',
    unlockWins: 4,
    kit: '#2f9fe8',
    kitDark: '#1c6ba3',
    accent: '#c9efff',
    theme: 'beach',
    keeperSkill: 0.55,
    shotChance: 0.4,
    winReward: 240,
  },
  {
    id: 'raio',
    name: 'Raio Negro',
    short: 'RAI',
    tier: 'Série A',
    unlockWins: 7,
    kit: '#3d4168',
    kitDark: '#23254a',
    accent: '#ffe05a',
    theme: 'night',
    keeperSkill: 0.7,
    shotChance: 0.5,
    winReward: 320,
  },
  {
    id: 'lendas',
    name: 'Lendas do Estádio',
    short: 'LEN',
    tier: 'Mundial',
    unlockWins: 10,
    kit: '#f5c542',
    kitDark: '#b08a1f',
    accent: '#fff3cf',
    theme: 'gold',
    keeperSkill: 0.85,
    shotChance: 0.6,
    winReward: 450,
  },
]

export type MomentType = 'freekick' | 'corner' | 'penalty' | 'breakaway' | 'longshot'

export interface Mover {
  axis: 'x' | 'z'
  range: number
  speed: number
  phase: number
}

export interface DefenderSpec {
  x: number
  z: number
  radius: number
  move?: Mover
  wall?: boolean
}

export interface KeeperSpec {
  z: number
  reach: number
  reachH: number
  speed: number
  guess: number
  skill: number
}

export interface CoinSpec {
  x: number
  z: number
}

export interface Moment {
  type: MomentType
  label: string
  hint: string
  ball: { x: number; z: number }
  goalHalf: number
  crossbar: number
  keeper: KeeperSpec
  defenders: DefenderSpec[]
  coins: CoinSpec[]
  wind: number
  minPath: number
}

const rand = (min: number, max: number) => min + Math.random() * (max - min)
const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)]
const sign = () => (Math.random() < 0.5 ? -1 : 1)
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const MOMENT_INFO: Record<MomentType, { label: string; hint: string }> = {
  freekick: { label: 'FALTA PERIGOSA', hint: 'Curve por cima ou contorne a barreira' },
  corner: { label: 'ESCANTEIO', hint: 'Cruze para dentro da área e surpreenda o goleiro' },
  penalty: { label: 'PÊNALTI', hint: 'Escolha o canto e engane o goleiro' },
  breakaway: { label: 'CARA A CARA', hint: 'O goleiro saiu do gol — toque por cobertura' },
  longshot: { label: 'CHUTE DE LONGE', hint: 'De longa distância, mire o ângulo certo' },
}

function keeperSpec(rival: Rival, boost = 0): KeeperSpec {
  const skill = clamp(rival.keeperSkill + boost, 0.1, 1)
  return {
    z: 62,
    reach: 55 + skill * 50,
    reachH: 50 + skill * 20,
    speed: 60 + skill * 130,
    guess: rand(-1, 1) * (1 - skill) * 55,
    skill,
  }
}

function corridorCoins(ball: { x: number; z: number }, goalTarget: number, count: number): CoinSpec[] {
  const coins: CoinSpec[] = []
  const points = [
    { x: ball.x, z: ball.z },
    { x: goalTarget * 0.7, z: (ball.z + 55) / 2 },
    { x: goalTarget, z: 72 },
  ]
  for (let index = 0; index < count; index += 1) {
    const t = (index + 1) / (count + 1)
    const segment = Math.min(1, Math.floor(t * 2))
    const local = t * 2 - segment
    const a = points[segment]
    const b = points[segment + 1]
    coins.push({
      x: clamp(a.x + (b.x - a.x) * local + rand(-28, 28), -280, 280),
      z: clamp(a.z + (b.z - a.z) * local + rand(-14, 14), 62, 440),
    })
  }
  return coins
}

export function generateMoment(rival: Rival, usedTypes: MomentType[]): Moment {
  const pool: MomentType[] = (['freekick', 'corner', 'penalty', 'breakaway', 'longshot'] as MomentType[]).filter(
    (type) => type !== usedTypes[usedTypes.length - 1],
  )
  const type = pick(pool)
  const skill = rival.keeperSkill

  let goalHalf = 132
  let ballX = 0
  let ballZ = 330
  let keeper = keeperSpec(rival)
  const defenders: DefenderSpec[] = []
  let wind = rand(-1, 1) * 0.24
  let goalTarget = rand(-70, 70)
  let minPath = 300

  if (type === 'freekick') {
    ballX = sign() * rand(70, 200)
    ballZ = rand(315, 345)
    goalHalf = 132
    const wallZ = ballZ - 95
    const wallCenter = (ballX * (wallZ - 55)) / (ballZ - 55) + rand(-14, 14)
    const count = 3 + Math.round(skill * 2)
    for (let index = 0; index < count; index += 1) {
      defenders.push({
        x: clamp(wallCenter + (index - (count - 1) / 2) * 30 + rand(-5, 5), -295, 295),
        z: wallZ + rand(-8, 8),
        radius: 17,
        wall: true,
      })
    }
    wind = rand(-1, 1) * 0.3
    goalTarget = sign() * rand(35, goalHalf - 38)
    minPath = Math.hypot(ballX - goalTarget, ballZ - 55) * 1.12 + 55
  } else if (type === 'corner') {
    const side = sign()
    ballX = side * 296
    ballZ = rand(295, 320)
    goalHalf = 130
    const count = 4 + Math.round(skill * 2)
    for (let index = 0; index < count; index += 1) {
      defenders.push({ x: side * rand(35, 150), z: rand(72, 155), radius: 17 })
    }
    wind = rand(0.06, 0.4) * sign()
    goalTarget = side * rand(20, 70)
    minPath = Math.hypot(ballX - goalTarget, ballZ - 55) * 1.18 + 60
  } else if (type === 'penalty') {
    ballX = rand(-14, 14)
    ballZ = 250
    goalHalf = 124
    const base = keeperSpec(rival, 0.12)
    keeper = { ...base, reach: Math.min(base.reach, 82), reachH: Math.min(base.reachH, 62) }
    wind = rand(-1, 1) * 0.16
    goalTarget = sign() * rand(30, 72)
    minPath = 280
  } else if (type === 'breakaway') {
    ballX = sign() * rand(25, 110)
    ballZ = rand(320, 345)
    goalHalf = 140
    keeper = { ...keeperSpec(rival, 0.06), z: 108 }
    const chasers = 1 + Math.round(skill)
    for (let index = 0; index < chasers; index += 1) {
      defenders.push({
        x: clamp(ballX + (index === 0 ? -1 : 1) * rand(55, 90), -290, 290),
        z: 400 + index * 22,
        radius: 17,
        move: { axis: 'x', range: 42, speed: 1.4, phase: index * 2 },
      })
    }
    wind = rand(-1, 1) * 0.2
    goalTarget = sign() * rand(30, 80)
    minPath = Math.hypot(ballX - goalTarget, ballZ - 55) * 1.1 + 50
  } else {
    ballX = sign() * rand(30, 160)
    ballZ = rand(375, 400)
    goalHalf = 140
    const count = 2 + Math.round(skill * 2)
    for (let index = 0; index < count; index += 1) {
      defenders.push({
        x: sign() * rand(60, 250),
        z: rand(150, 280) - index * 12,
        radius: 17,
        move: { axis: 'x', range: 34, speed: 1.1 + index * 0.2, phase: index * 1.7 },
      })
    }
    wind = rand(-1, 1) * 0.34
    goalTarget = sign() * rand(45, goalHalf - 40)
    minPath = Math.hypot(ballX - goalTarget, ballZ - 55) * 1.15 + 55
  }

  return {
    type,
    label: MOMENT_INFO[type].label,
    hint: MOMENT_INFO[type].hint,
    ball: { x: ballX, z: ballZ },
    goalHalf,
    crossbar: 75,
    keeper,
    defenders,
    coins: corridorCoins({ x: ballX, z: ballZ }, goalTarget, type === 'corner' ? 5 : 4),
    wind,
    minPath,
  }
}

export const USER_MOMENTS = 6
export const RIVAL_ATTACKS = 4
