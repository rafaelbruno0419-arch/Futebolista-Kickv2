import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, MousePointer2, RotateCcw, Wind } from 'lucide-react'
import { playSound } from '../game/audio'
import type { Level, Obstacle, Point } from '../game/levels'

const WORLD_WIDTH = 720
const WORLD_HEIGHT = 900
const BALL_RADIUS = 13

type Phase = 'aim' | 'drawing' | 'flying' | 'goal' | 'failed'

interface GameResult {
  won: boolean
  stars: number
  score: number
  collected: number
  attemptsLeft: number
}

interface GameCanvasProps {
  level: Level
  ballStyle: string
  kitColor: string
  sound: boolean
  haptics: boolean
  onComplete: (result: GameResult) => void
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const chaikin = (points: Point[], passes = 2) => {
  let result = points
  for (let pass = 0; pass < passes; pass += 1) {
    if (result.length < 3) return result
    const next: Point[] = [result[0]]
    for (let index = 0; index < result.length - 1; index += 1) {
      const current = result[index]
      const after = result[index + 1]
      next.push(
        { x: current.x * 0.75 + after.x * 0.25, y: current.y * 0.75 + after.y * 0.25 },
        { x: current.x * 0.25 + after.x * 0.75, y: current.y * 0.25 + after.y * 0.75 },
      )
    }
    next.push(result[result.length - 1])
    result = next
  }
  return result
}

const pathMetrics = (points: Point[]) => {
  const cumulative = [0]
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1], points[index])
    cumulative.push(total)
  }
  return { cumulative, total }
}

const pointAtDistance = (points: Point[], cumulative: number[], target: number) => {
  if (target <= 0) return points[0]
  const total = cumulative[cumulative.length - 1]
  if (target >= total) return points[points.length - 1]
  let index = 1
  while (index < cumulative.length && cumulative[index] < target) index += 1
  const start = points[index - 1]
  const end = points[index]
  const section = cumulative[index] - cumulative[index - 1]
  const ratio = section ? (target - cumulative[index - 1]) / section : 0
  return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio }
}

const obstaclePosition = (obstacle: Obstacle, time: number): Point => {
  if (!obstacle.move) return { x: obstacle.x, y: obstacle.y }
  const offset = Math.sin(time * obstacle.move.speed + (obstacle.move.phase ?? 0)) * obstacle.move.range
  return {
    x: obstacle.x + (obstacle.move.axis === 'x' ? offset : 0),
    y: obstacle.y + (obstacle.move.axis === 'y' ? offset : 0),
  }
}

const roundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.roundRect(x, y, width, height, safeRadius)
}

const drawBall = (context: CanvasRenderingContext2D, point: Point, style: string, rotation = 0, scale = 1) => {
  const radius = BALL_RADIUS * scale
  context.save()
  context.translate(point.x, point.y)
  context.rotate(rotation)
  context.shadowColor = style === 'neon' ? '#41e4c1' : 'rgba(0,0,0,.35)'
  context.shadowBlur = style === 'neon' ? 18 : 8
  context.shadowOffsetY = style === 'neon' ? 0 : 5
  const gradient = context.createRadialGradient(-4, -5, 1, 0, 0, radius)
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

const drawCharacter = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  facing = 1,
  keeper = false,
) => {
  context.save()
  context.translate(x, y)
  context.scale(facing, 1)
  context.fillStyle = 'rgba(3, 15, 22, .24)'
  context.beginPath()
  context.ellipse(0, 26, 23, 7, 0, 0, Math.PI * 2)
  context.fill()
  context.strokeStyle = '#152c39'
  context.lineWidth = 8
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(-5, 12)
  context.lineTo(-10, 29)
  context.moveTo(5, 12)
  context.lineTo(12, 28)
  context.stroke()
  context.strokeStyle = color
  context.lineWidth = 10
  context.beginPath()
  context.moveTo(0, -10)
  context.lineTo(0, 12)
  context.stroke()
  context.strokeStyle = keeper ? '#ffcf45' : color
  context.lineWidth = 7
  context.beginPath()
  context.moveTo(-2, -5)
  context.lineTo(-18, keeper ? -16 : 4)
  context.moveTo(2, -5)
  context.lineTo(18, keeper ? -16 : 4)
  context.stroke()
  context.fillStyle = '#f2aa72'
  context.beginPath()
  context.arc(0, -24, 11, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#162b38'
  context.beginPath()
  context.arc(-1, -27, 11, Math.PI, Math.PI * 2)
  context.lineTo(10, -23)
  context.arc(0, -24, 11, 0, Math.PI * 2)
  context.fill()
  context.restore()
}

export function GameCanvas({ level, ballStyle, kitColor, sound, haptics, onComplete }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef(0)
  const timeoutsRef = useRef<number[]>([])
  const phaseRef = useRef<Phase>('aim')
  const drawingRef = useRef(false)
  const rawPathRef = useRef<Point[]>([])
  const shotPathRef = useRef<Point[]>([])
  const cumulativeRef = useRef<number[]>([])
  const pathLengthRef = useRef(0)
  const traveledRef = useRef(0)
  const shotStartedRef = useRef(0)
  const lastFrameRef = useRef(performance.now())
  const attemptsRef = useRef(3)
  const collectedRef = useRef(new Set<number>())
  const trailRef = useRef<Point[]>([])
  const ballPositionRef = useRef<Point>({ ...level.ball })
  const finishedRef = useRef(false)
  const [, forceFrame] = useState(0)
  const [attempts, setAttempts] = useState(3)
  const [phase, setPhase] = useState<Phase>('aim')
  const [collected, setCollected] = useState(0)
  const [message, setMessage] = useState('Arraste a partir da bola e desenhe o chute')

  const setGamePhase = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const vibrate = useCallback(
    (pattern: number | number[]) => {
      if (haptics && 'vibrate' in navigator) navigator.vibrate(pattern)
    },
    [haptics],
  )

  const resetAttempt = useCallback(() => {
    drawingRef.current = false
    rawPathRef.current = []
    shotPathRef.current = []
    cumulativeRef.current = []
    pathLengthRef.current = 0
    traveledRef.current = 0
    collectedRef.current = new Set()
    trailRef.current = []
    ballPositionRef.current = { ...level.ball }
    setCollected(0)
    setMessage('Tente outra rota — você consegue!')
    setGamePhase('aim')
  }, [level.ball, setGamePhase])

  const completeFailure = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    onComplete({ won: false, stars: 0, score: 0, collected: collectedRef.current.size, attemptsLeft: 0 })
  }, [onComplete])

  const failShot = useCallback(
    (reason: string) => {
      if (phaseRef.current !== 'flying') return
      setGamePhase('failed')
      setMessage(reason)
      playSound('fail', sound)
      vibrate([40, 50, 80])
      const timeout = window.setTimeout(() => {
        if (attemptsRef.current > 0) resetAttempt()
        else completeFailure()
      }, 1150)
      timeoutsRef.current.push(timeout)
    },
    [completeFailure, resetAttempt, setGamePhase, sound, vibrate],
  )

  const scoreGoal = useCallback(() => {
    if (phaseRef.current !== 'flying' || finishedRef.current) return
    setGamePhase('goal')
    setMessage('GOOOOL! Jogada brilhante!')
    playSound('goal', sound)
    vibrate([35, 35, 35, 35, 100])
    const allCoins = level.coins.length === 0 || collectedRef.current.size === level.coins.length
    const efficient = pathLengthRef.current < 735 || Math.abs(level.wind) >= 0.07
    const stars = 1 + (allCoins ? 1 : 0) + (allCoins && efficient ? 1 : 0)
    const score = Math.round(1000 + collectedRef.current.size * 350 + attemptsRef.current * 180 + (efficient ? 240 : 0))
    const timeout = window.setTimeout(() => {
      if (finishedRef.current) return
      finishedRef.current = true
      onComplete({
        won: true,
        stars,
        score,
        collected: collectedRef.current.size,
        attemptsLeft: attemptsRef.current,
      })
    }, 1250)
    timeoutsRef.current.push(timeout)
  }, [level.coins.length, level.wind, onComplete, setGamePhase, sound, vibrate])

  const hitObstacle = useCallback((ball: Point, obstacle: Obstacle, time: number) => {
    const position = obstaclePosition(obstacle, time)
    if (obstacle.type === 'crate' || obstacle.type === 'wall') {
      const width = obstacle.width ?? 80
      const height = obstacle.height ?? 60
      return (
        ball.x + BALL_RADIUS > position.x &&
        ball.x - BALL_RADIUS < position.x + width &&
        ball.y + BALL_RADIUS > position.y &&
        ball.y - BALL_RADIUS < position.y + height
      )
    }
    return distance(ball, position) < (obstacle.radius ?? 27) + BALL_RADIUS - 3
  }, [])

  const drawScene = useCallback(
    (context: CanvasRenderingContext2D, now: number) => {
      const time = now / 1000
      const palettes = {
        rooftop: { skyA: '#85e2eb', skyB: '#d9f5e8', fieldA: '#218a66', fieldB: '#1d775b', line: '#c7fff0' },
        night: { skyA: '#101846', skyB: '#273574', fieldA: '#102d51', fieldB: '#153961', line: '#41e4e0' },
        beach: { skyA: '#53c8ed', skyB: '#ffe2a3', fieldA: '#d99f57', fieldB: '#c68b48', line: '#fff1ca' },
        street: { skyA: '#f07c5d', skyB: '#ffc76f', fieldA: '#3b5661', fieldB: '#314a55', line: '#d6f4ef' },
      }
      const palette = palettes[level.theme]
      const sky = context.createLinearGradient(0, 0, 0, WORLD_HEIGHT)
      sky.addColorStop(0, palette.skyA)
      sky.addColorStop(0.55, palette.skyB)
      sky.addColorStop(1, palette.fieldB)
      context.fillStyle = sky
      context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

      if (level.theme === 'night') {
        context.fillStyle = '#68f5e422'
        for (let index = 0; index < 14; index += 1) {
          const x = index * 61 - 30
          const height = 72 + (index % 4) * 35
          context.fillRect(x, 85 - height, 48, height)
          context.fillStyle = index % 2 ? '#41e4c155' : '#5f7cff55'
          for (let windowIndex = 0; windowIndex < 3; windowIndex += 1) context.fillRect(x + 8 + windowIndex * 13, 24, 6, 23)
          context.fillStyle = '#68f5e422'
        }
      } else if (level.theme === 'beach') {
        context.fillStyle = '#41b5d0'
        context.fillRect(0, 73, WORLD_WIDTH, 70)
        context.strokeStyle = '#ffffff88'
        context.lineWidth = 5
        for (let index = 0; index < 5; index += 1) {
          context.beginPath()
          context.moveTo(index * 170 - 50, 118)
          context.quadraticCurveTo(index * 170 + 20, 104, index * 170 + 95, 119)
          context.stroke()
        }
      } else {
        context.fillStyle = level.theme === 'street' ? '#243b48' : '#467b85'
        for (let index = 0; index < 11; index += 1) {
          const height = 35 + (index % 4) * 18
          context.fillRect(index * 76 - 20, 110 - height, 58, height)
        }
      }

      context.save()
      context.beginPath()
      context.moveTo(68, 104)
      context.lineTo(652, 104)
      context.lineTo(770, 900)
      context.lineTo(-50, 900)
      context.closePath()
      context.clip()
      context.fillStyle = palette.fieldA
      context.fillRect(0, 100, WORLD_WIDTH, 800)
      for (let index = 0; index < 9; index += 1) {
        const top = 100 + index * 100
        context.fillStyle = index % 2 ? `${palette.fieldB}b8` : `${palette.fieldA}88`
        context.fillRect(0, top, WORLD_WIDTH, 100)
      }
      if (level.theme === 'night') {
        context.strokeStyle = '#4feee91c'
        context.lineWidth = 1
        for (let x = 0; x < WORLD_WIDTH; x += 36) {
          context.beginPath()
          context.moveTo(x, 100)
          context.lineTo(x, 900)
          context.stroke()
        }
      }
      context.strokeStyle = palette.line
      context.globalAlpha = 0.78
      context.lineWidth = 4
      context.beginPath()
      context.moveTo(69, 104)
      context.lineTo(651, 104)
      context.lineTo(769, 899)
      context.lineTo(-49, 899)
      context.closePath()
      context.stroke()
      context.beginPath()
      context.moveTo(216, 110)
      context.lineTo(189, 300)
      context.lineTo(531, 300)
      context.lineTo(504, 110)
      context.stroke()
      context.beginPath()
      context.arc(360, 530, 92, 0, Math.PI * 2)
      context.stroke()
      context.beginPath()
      context.moveTo(0, 530)
      context.lineTo(720, 530)
      context.stroke()
      context.globalAlpha = 1
      context.restore()

      // Goal and net
      const goalLeft = level.goal.x - level.goal.width / 2
      const goalRight = level.goal.x + level.goal.width / 2
      context.save()
      context.strokeStyle = level.theme === 'night' ? '#60f6ed99' : '#d7e7e7bb'
      context.lineWidth = 2
      context.fillStyle = level.theme === 'night' ? '#41e4c112' : '#ffffff22'
      context.beginPath()
      context.moveTo(goalLeft, level.goal.y)
      context.lineTo(goalRight, level.goal.y)
      context.lineTo(goalRight - 18, level.goal.y + 76)
      context.lineTo(goalLeft + 18, level.goal.y + 76)
      context.closePath()
      context.fill()
      context.stroke()
      for (let index = 1; index < 8; index += 1) {
        const x = goalLeft + (level.goal.width / 8) * index
        context.beginPath()
        context.moveTo(x, level.goal.y)
        context.lineTo(x + (level.goal.x - x) * 0.13, level.goal.y + 76)
        context.stroke()
      }
      for (let index = 1; index < 4; index += 1) {
        const y = level.goal.y + index * 19
        context.beginPath()
        context.moveTo(goalLeft + index * 4.5, y)
        context.lineTo(goalRight - index * 4.5, y)
        context.stroke()
      }
      context.strokeStyle = '#f4ffff'
      context.shadowColor = level.theme === 'night' ? '#41e4c1' : 'rgba(0,0,0,.18)'
      context.shadowBlur = level.theme === 'night' ? 14 : 5
      context.lineWidth = 10
      context.lineCap = 'round'
      context.beginPath()
      context.moveTo(goalLeft, level.goal.y + 77)
      context.lineTo(goalLeft, level.goal.y)
      context.lineTo(goalRight, level.goal.y)
      context.lineTo(goalRight, level.goal.y + 77)
      context.stroke()
      context.restore()

      if (level.keeper) {
        const keeperX = level.keeper.x + Math.sin(time * level.keeper.speed) * level.keeper.range
        drawCharacter(context, keeperX, level.keeper.y, '#f5bf35', Math.cos(time * level.keeper.speed) > 0 ? 1 : -1, true)
      }

      level.obstacles.forEach((obstacle) => {
        const position = obstaclePosition(obstacle, time)
        if (obstacle.type === 'defender') {
          drawCharacter(context, position.x, position.y, '#ee5d67', Math.sin(time + obstacle.x) > 0 ? 1 : -1)
        } else if (obstacle.type === 'crate') {
          const width = obstacle.width ?? 80
          const height = obstacle.height ?? 60
          context.fillStyle = 'rgba(4,15,24,.25)'
          roundedRect(context, position.x + 8, position.y + 9, width, height, 10)
          context.fill()
          const wood = context.createLinearGradient(position.x, position.y, position.x, position.y + height)
          wood.addColorStop(0, '#f1a052')
          wood.addColorStop(1, '#a9492f')
          context.fillStyle = wood
          roundedRect(context, position.x, position.y, width, height, 9)
          context.fill()
          context.strokeStyle = '#7c3528'
          context.lineWidth = 7
          context.stroke()
          context.lineWidth = 4
          context.beginPath()
          context.moveTo(position.x + 10, position.y + 10)
          context.lineTo(position.x + width - 10, position.y + height - 10)
          context.moveTo(position.x + width - 10, position.y + 10)
          context.lineTo(position.x + 10, position.y + height - 10)
          context.stroke()
        } else if (obstacle.type === 'wall') {
          const width = obstacle.width ?? 100
          const height = obstacle.height ?? 25
          context.shadowColor = '#03101a88'
          context.shadowBlur = 10
          context.fillStyle = level.theme === 'night' ? '#755cf5' : '#243e49'
          roundedRect(context, position.x, position.y, width, height, 8)
          context.fill()
          context.shadowColor = 'transparent'
          context.fillStyle = level.theme === 'night' ? '#5affdb' : '#ffc957'
          roundedRect(context, position.x + 7, position.y + 6, width - 14, 5, 3)
          context.fill()
        } else {
          context.fillStyle = '#f17d3d'
          context.beginPath()
          context.moveTo(position.x, position.y - 28)
          context.lineTo(position.x - 21, position.y + 24)
          context.lineTo(position.x + 21, position.y + 24)
          context.closePath()
          context.fill()
          context.fillStyle = '#fff0d5'
          context.fillRect(position.x - 15, position.y, 30, 7)
        }
      })

      level.coins.forEach((coin, index) => {
        if (collectedRef.current.has(index)) return
        const float = Math.sin(time * 3 + index) * 4
        context.save()
        context.translate(coin.x, coin.y + float)
        context.shadowColor = '#ffcf45'
        context.shadowBlur = 14
        context.fillStyle = '#ffc83e'
        context.beginPath()
        context.arc(0, 0, 15, 0, Math.PI * 2)
        context.fill()
        context.shadowColor = 'transparent'
        context.strokeStyle = '#fff3a8'
        context.lineWidth = 3
        context.stroke()
        context.fillStyle = '#9d6d12'
        context.font = '800 15px system-ui'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText('K', 0, 1)
        context.restore()
      })

      // Player taking the kick
      drawCharacter(context, level.ball.x + 38, level.ball.y + 35, kitColor, -1)

      const drawnPath = phaseRef.current === 'drawing' ? rawPathRef.current : shotPathRef.current
      if ((phaseRef.current === 'drawing' || phaseRef.current === 'flying') && drawnPath.length > 1) {
        context.save()
        context.strokeStyle = '#d9fff7'
        context.shadowColor = '#28e1c0'
        context.shadowBlur = 13
        context.lineWidth = 7
        context.lineCap = 'round'
        context.lineJoin = 'round'
        context.setLineDash([18, 13])
        context.beginPath()
        if (phaseRef.current === 'flying') {
          const progress = clamp(traveledRef.current / Math.max(pathLengthRef.current, 1), 0, 1)
          const startIndex = Math.min(drawnPath.length - 1, Math.floor(drawnPath.length * progress))
          context.moveTo(ballPositionRef.current.x, ballPositionRef.current.y)
          for (let index = startIndex; index < drawnPath.length; index += 1) context.lineTo(drawnPath[index].x, drawnPath[index].y)
        } else {
          context.moveTo(drawnPath[0].x, drawnPath[0].y)
          for (let index = 1; index < drawnPath.length; index += 1) context.lineTo(drawnPath[index].x, drawnPath[index].y)
        }
        context.stroke()
        context.restore()
      }

      trailRef.current.forEach((trail, index) => {
        const alpha = (index + 1) / trailRef.current.length
        context.fillStyle = `rgba(69, 235, 202, ${alpha * 0.25})`
        context.beginPath()
        context.arc(trail.x, trail.y, 4 + alpha * 5, 0, Math.PI * 2)
        context.fill()
      })

      const ball = ballPositionRef.current
      const rotation = phaseRef.current === 'flying' ? traveledRef.current / 22 : Math.sin(time * 1.5) * 0.08
      drawBall(context, ball, ballStyle, rotation, phaseRef.current === 'goal' ? 1.08 : 1)

      if (phaseRef.current === 'goal') {
        for (let index = 0; index < 54; index += 1) {
          const age = ((now - shotStartedRef.current) / 1000 + index * 0.037) % 1.7
          const x = (index * 137 + 31) % WORLD_WIDTH
          const y = -20 + age * 620 + Math.sin(index) * 30
          context.fillStyle = ['#41e4c1', '#ffc83e', '#f45d73', '#ffffff'][index % 4]
          context.save()
          context.translate(x, y)
          context.rotate(age * 5 + index)
          context.fillRect(-4, -8, 8, 16)
          context.restore()
        }
      }
    },
    [ballStyle, kitColor, level],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = WORLD_WIDTH * dpr
    canvas.height = WORLD_HEIGHT * dpr
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(dpr, 0, 0, dpr, 0, 0)

    const frame = (now: number) => {
      const delta = Math.min((now - lastFrameRef.current) / 1000, 0.034)
      lastFrameRef.current = now
      const time = now / 1000

      if (phaseRef.current === 'flying') {
        traveledRef.current += delta * (500 + level.id * 7)
        const raw = pointAtDistance(shotPathRef.current, cumulativeRef.current, traveledRef.current)
        const progress = clamp(traveledRef.current / Math.max(pathLengthRef.current, 1), 0, 1)
        const current = { x: raw.x + level.wind * progress * progress * 130, y: raw.y }
        ballPositionRef.current = current
        trailRef.current.push(current)
        if (trailRef.current.length > 15) trailRef.current.shift()

        level.coins.forEach((coin, index) => {
          if (!collectedRef.current.has(index) && distance(current, coin) < 31) {
            collectedRef.current.add(index)
            setCollected(collectedRef.current.size)
            playSound('coin', sound)
          }
        })

        const obstacle = level.obstacles.find((item) => hitObstacle(current, item, time))
        if (obstacle) failShot(obstacle.type === 'defender' ? 'Bloqueado pela defesa!' : 'A bola bateu no obstáculo!')

        if (phaseRef.current === 'flying' && level.keeper && current.y < level.keeper.y + 28) {
          const keeperX = level.keeper.x + Math.sin(time * level.keeper.speed) * level.keeper.range
          if (distance(current, { x: keeperX, y: level.keeper.y - 2 }) < (level.keeper.radius ?? 30) + BALL_RADIUS) {
            failShot('Defesa espetacular do goleiro!')
          }
        }

        if (phaseRef.current === 'flying' && current.y <= level.goal.y + 18) {
          const left = level.goal.x - level.goal.width / 2 + 10
          const right = level.goal.x + level.goal.width / 2 - 10
          if (current.x >= left && current.x <= right) scoreGoal()
          else failShot('Passou raspando! Ajuste a curva.')
        } else if (phaseRef.current === 'flying' && traveledRef.current >= pathLengthRef.current) {
          failShot('Faltou força — desenhe até a rede!')
        }
      }

      context.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
      drawScene(context, now)
      animationRef.current = requestAnimationFrame(frame)
    }
    animationRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(animationRef.current)
  }, [drawScene, failShot, hitObstacle, level, scoreGoal, sound])

  useEffect(
    () => () => {
      timeoutsRef.current.forEach(window.clearTimeout)
    },
    [],
  )

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * WORLD_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * WORLD_HEIGHT,
    }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== 'aim') return
    const point = canvasPoint(event)
    if (distance(point, level.ball) > 100) {
      setMessage('Comece o traço em cima da bola')
      vibrate(20)
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingRef.current = true
    rawPathRef.current = [{ ...level.ball }]
    setGamePhase('drawing')
    setMessage('Curve o traço e atravesse o gol')
    forceFrame((value) => value + 1)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || phaseRef.current !== 'drawing') return
    const point = canvasPoint(event)
    const bounded = { x: clamp(point.x, 20, 700), y: clamp(point.y, 100, 830) }
    const last = rawPathRef.current[rawPathRef.current.length - 1]
    if (distance(last, bounded) >= 8 && rawPathRef.current.length < 180) rawPathRef.current.push(bounded)
  }

  const launch = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || phaseRef.current !== 'drawing') return
    drawingRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const path = rawPathRef.current
    const last = path[path.length - 1]
    if (path.length < 4 || last.y > level.ball.y - 110) {
      rawPathRef.current = []
      setGamePhase('aim')
      setMessage('Trace um caminho mais longo em direção ao gol')
      return
    }
    const smooth = chaikin(path, 2)
    const metrics = pathMetrics(smooth)
    shotPathRef.current = smooth
    cumulativeRef.current = metrics.cumulative
    pathLengthRef.current = metrics.total
    traveledRef.current = 0
    shotStartedRef.current = performance.now()
    attemptsRef.current -= 1
    setAttempts(attemptsRef.current)
    setGamePhase('flying')
    setMessage('Bola em movimento!')
    playSound('kick', sound)
    vibrate(28)
  }

  const windLabel = level.wind === 0 ? 'Sem vento' : `${level.wind > 0 ? '→' : '←'} ${Math.round(Math.abs(level.wind) * 100)} km/h`

  return (
    <div className="game-canvas-wrap" ref={containerRef}>
      <div className="canvas-hud" aria-live="polite">
        <div className="hud-pill"><span className="hud-label">CHANCES</span><span className="chance-dots">{[0, 1, 2].map((index) => <i key={index} className={index < attempts ? 'active' : ''} />)}</span></div>
        <div className="hud-pill level-hud"><span>FASE {level.id}</span><strong>{level.title}</strong></div>
        <div className="hud-pill"><span className="coin-mini">K</span><strong>{collected}/{level.coins.length}</strong></div>
      </div>
      <canvas
        ref={canvasRef}
        className={`game-canvas phase-${phase}`}
        aria-label={`Campo de futebol da fase ${level.id}. Arraste a partir da bola para desenhar o chute.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={launch}
        onPointerCancel={launch}
      />
      <div className={`game-callout ${phase}`}>
        {phase === 'aim' && <MousePointer2 size={18} />}
        {phase === 'drawing' && <ArrowUp size={18} />}
        {phase === 'failed' && <RotateCcw size={18} />}
        <span>{message}</span>
      </div>
      <div className="wind-chip" title="Força do vento"><Wind size={15} /><span>{windLabel}</span></div>
    </div>
  )
}
