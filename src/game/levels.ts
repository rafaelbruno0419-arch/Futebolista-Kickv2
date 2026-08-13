export type ThemeKey = 'rooftop' | 'night' | 'beach' | 'street'

export interface Point {
  x: number
  y: number
}

export interface Obstacle {
  id: string
  type: 'defender' | 'crate' | 'wall' | 'cone'
  x: number
  y: number
  radius?: number
  width?: number
  height?: number
  move?: { axis: 'x' | 'y'; range: number; speed: number; phase?: number }
}

export interface Keeper {
  x: number
  y: number
  range: number
  speed: number
  radius?: number
}

export interface Level {
  id: number
  title: string
  subtitle: string
  chapter: string
  theme: ThemeKey
  difficulty: 'Fácil' | 'Médio' | 'Difícil' | 'Lendário'
  ball: Point
  goal: { x: number; y: number; width: number }
  keeper?: Keeper
  obstacles: Obstacle[]
  coins: Point[]
  wind: number
  reward: number
}

const ball = { x: 360, y: 764 }
const goal = { x: 360, y: 168, width: 276 }

export const levels: Level[] = [
  {
    id: 1,
    title: 'Primeiro traço',
    subtitle: 'Desenhe até o fundo da rede',
    chapter: 'Coberturas da Aurora',
    theme: 'rooftop',
    difficulty: 'Fácil',
    ball,
    goal,
    obstacles: [],
    coins: [{ x: 360, y: 446 }],
    wind: 0,
    reward: 80,
  },
  {
    id: 2,
    title: 'Mãos rápidas',
    subtitle: 'Tire a bola do alcance do goleiro',
    chapter: 'Coberturas da Aurora',
    theme: 'rooftop',
    difficulty: 'Fácil',
    ball,
    goal,
    keeper: { x: 360, y: 205, range: 82, speed: 1.25 },
    obstacles: [],
    coins: [{ x: 258, y: 450 }, { x: 475, y: 340 }],
    wind: 0,
    reward: 90,
  },
  {
    id: 3,
    title: 'A barreira',
    subtitle: 'Uma curva vale mais que força',
    chapter: 'Coberturas da Aurora',
    theme: 'rooftop',
    difficulty: 'Médio',
    ball,
    goal,
    keeper: { x: 360, y: 205, range: 62, speed: 1.45 },
    obstacles: [
      { id: 'd1', type: 'defender', x: 300, y: 454, radius: 28 },
      { id: 'd2', type: 'defender', x: 360, y: 446, radius: 28 },
      { id: 'd3', type: 'defender', x: 420, y: 454, radius: 28 },
    ],
    coins: [{ x: 500, y: 385 }, { x: 470, y: 284 }],
    wind: 0,
    reward: 105,
  },
  {
    id: 4,
    title: 'Beco sem saída',
    subtitle: 'Costure o chute entre as caixas',
    chapter: 'Noite Neon',
    theme: 'night',
    difficulty: 'Médio',
    ball,
    goal,
    keeper: { x: 360, y: 205, range: 88, speed: 1.7 },
    obstacles: [
      { id: 'c1', type: 'crate', x: 225, y: 560, width: 92, height: 82 },
      { id: 'c2', type: 'crate', x: 468, y: 478, width: 96, height: 88 },
      { id: 'c3', type: 'crate', x: 245, y: 340, width: 104, height: 82 },
    ],
    coins: [{ x: 395, y: 580 }, { x: 360, y: 365 }, { x: 492, y: 287 }],
    wind: 0.02,
    reward: 115,
  },
  {
    id: 5,
    title: 'Dança da defesa',
    subtitle: 'Leia o movimento e ataque o espaço',
    chapter: 'Noite Neon',
    theme: 'night',
    difficulty: 'Médio',
    ball,
    goal,
    keeper: { x: 360, y: 205, range: 94, speed: 2 },
    obstacles: [
      { id: 'd1', type: 'defender', x: 275, y: 495, radius: 30, move: { axis: 'x', range: 95, speed: 1.1 } },
      { id: 'd2', type: 'defender', x: 445, y: 350, radius: 30, move: { axis: 'x', range: 92, speed: 1.35, phase: 2 } },
    ],
    coins: [{ x: 184, y: 475 }, { x: 525, y: 335 }],
    wind: -0.025,
    reward: 130,
  },
  {
    id: 6,
    title: 'Portão laser',
    subtitle: 'Passe pela abertura móvel',
    chapter: 'Noite Neon',
    theme: 'night',
    difficulty: 'Difícil',
    ball,
    goal,
    keeper: { x: 360, y: 205, range: 100, speed: 2.15 },
    obstacles: [
      { id: 'w1', type: 'wall', x: 85, y: 450, width: 238, height: 26 },
      { id: 'w2', type: 'wall', x: 405, y: 450, width: 230, height: 26 },
      { id: 'd1', type: 'defender', x: 360, y: 315, radius: 28, move: { axis: 'x', range: 100, speed: 1.5 } },
    ],
    coins: [{ x: 360, y: 515 }, { x: 360, y: 390 }, { x: 500, y: 285 }],
    wind: 0.035,
    reward: 145,
  },
  {
    id: 7,
    title: 'Areia quente',
    subtitle: 'Não deixe o vento decidir por você',
    chapter: 'Copa do Litoral',
    theme: 'beach',
    difficulty: 'Médio',
    ball,
    goal,
    keeper: { x: 360, y: 205, range: 88, speed: 1.9 },
    obstacles: [
      { id: 'c1', type: 'cone', x: 315, y: 505, radius: 25 },
      { id: 'c2', type: 'cone', x: 405, y: 505, radius: 25 },
      { id: 'd1', type: 'defender', x: 360, y: 355, radius: 31 },
    ],
    coins: [{ x: 245, y: 450 }, { x: 488, y: 360 }],
    wind: 0.06,
    reward: 150,
  },
  {
    id: 8,
    title: 'Onda de pressão',
    subtitle: 'Colecione tudo em uma única curva',
    chapter: 'Copa do Litoral',
    theme: 'beach',
    difficulty: 'Difícil',
    ball,
    goal,
    keeper: { x: 360, y: 205, range: 104, speed: 2.35 },
    obstacles: [
      { id: 'd1', type: 'defender', x: 230, y: 535, radius: 30, move: { axis: 'x', range: 65, speed: 1.4 } },
      { id: 'd2', type: 'defender', x: 470, y: 405, radius: 30, move: { axis: 'y', range: 65, speed: 1.2 } },
      { id: 'd3', type: 'defender', x: 275, y: 300, radius: 30, move: { axis: 'x', range: 85, speed: 1.6 } },
    ],
    coins: [{ x: 505, y: 570 }, { x: 300, y: 430 }, { x: 465, y: 285 }],
    wind: -0.07,
    reward: 170,
  },
  {
    id: 9,
    title: 'Maré alta',
    subtitle: 'O corredor perfeito dura um instante',
    chapter: 'Copa do Litoral',
    theme: 'beach',
    difficulty: 'Difícil',
    ball,
    goal,
    keeper: { x: 360, y: 205, range: 112, speed: 2.5 },
    obstacles: [
      { id: 'w1', type: 'wall', x: 80, y: 530, width: 180, height: 28, move: { axis: 'x', range: 48, speed: 1 } },
      { id: 'w2', type: 'wall', x: 460, y: 530, width: 180, height: 28, move: { axis: 'x', range: 48, speed: 1, phase: 3.14 } },
      { id: 'd1', type: 'defender', x: 360, y: 390, radius: 33, move: { axis: 'x', range: 150, speed: 1.75 } },
      { id: 'd2', type: 'defender', x: 360, y: 285, radius: 29, move: { axis: 'x', range: 115, speed: 2.1, phase: 2 } },
    ],
    coins: [{ x: 360, y: 585 }, { x: 180, y: 405 }, { x: 520, y: 290 }],
    wind: 0.075,
    reward: 190,
  },
  {
    id: 10,
    title: 'Reis da rua',
    subtitle: 'Sem medo, sem falta, sem linha reta',
    chapter: 'Distrito dos Campeões',
    theme: 'street',
    difficulty: 'Difícil',
    ball,
    goal,
    keeper: { x: 360, y: 205, range: 116, speed: 2.7 },
    obstacles: [
      { id: 'c1', type: 'crate', x: 145, y: 505, width: 125, height: 90 },
      { id: 'c2', type: 'crate', x: 450, y: 505, width: 125, height: 90 },
      { id: 'd1', type: 'defender', x: 360, y: 480, radius: 31, move: { axis: 'x', range: 82, speed: 1.8 } },
      { id: 'd2', type: 'defender', x: 360, y: 320, radius: 31, move: { axis: 'x', range: 145, speed: 2.15 } },
    ],
    coins: [{ x: 360, y: 590 }, { x: 235, y: 390 }, { x: 500, y: 290 }],
    wind: -0.045,
    reward: 220,
  },
  {
    id: 11,
    title: 'Último bloqueio',
    subtitle: 'Cada toque precisa ser calculado',
    chapter: 'Distrito dos Campeões',
    theme: 'street',
    difficulty: 'Lendário',
    ball,
    goal,
    keeper: { x: 360, y: 205, range: 120, speed: 2.95 },
    obstacles: [
      { id: 'w1', type: 'wall', x: 80, y: 590, width: 235, height: 25 },
      { id: 'w2', type: 'wall', x: 405, y: 590, width: 235, height: 25 },
      { id: 'd1', type: 'defender', x: 230, y: 465, radius: 31, move: { axis: 'x', range: 100, speed: 1.8 } },
      { id: 'd2', type: 'defender', x: 490, y: 365, radius: 31, move: { axis: 'x', range: 105, speed: 2.15, phase: 2 } },
      { id: 'd3', type: 'defender', x: 290, y: 285, radius: 29, move: { axis: 'x', range: 80, speed: 2.4 } },
    ],
    coins: [{ x: 360, y: 640 }, { x: 500, y: 490 }, { x: 195, y: 350 }],
    wind: 0.085,
    reward: 250,
  },
  {
    id: 12,
    title: 'Gol de lenda',
    subtitle: 'Sua obra-prima espera por você',
    chapter: 'Distrito dos Campeões',
    theme: 'night',
    difficulty: 'Lendário',
    ball,
    goal,
    keeper: { x: 360, y: 205, range: 122, speed: 3.2 },
    obstacles: [
      { id: 'c1', type: 'crate', x: 108, y: 565, width: 110, height: 90 },
      { id: 'c2', type: 'crate', x: 502, y: 565, width: 110, height: 90 },
      { id: 'd1', type: 'defender', x: 360, y: 530, radius: 32, move: { axis: 'x', range: 128, speed: 2.05 } },
      { id: 'd2', type: 'defender', x: 250, y: 390, radius: 30, move: { axis: 'x', range: 105, speed: 2.4 } },
      { id: 'd3', type: 'defender', x: 470, y: 300, radius: 30, move: { axis: 'x', range: 118, speed: 2.7, phase: 2.6 } },
      { id: 'w1', type: 'wall', x: 295, y: 255, width: 130, height: 22 },
    ],
    coins: [{ x: 175, y: 470 }, { x: 520, y: 405 }, { x: 250, y: 275 }],
    wind: -0.095,
    reward: 320,
  },
]

export const getLevel = (id: number) => levels.find((level) => level.id === id) ?? levels[0]
