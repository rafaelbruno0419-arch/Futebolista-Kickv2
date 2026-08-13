import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  CircleHelp,
  Coins,
  Compass,
  Crown,
  Gamepad2,
  Gem,
  Gift,
  Home,
  Lock,
  Medal,
  Menu,
  Palette,
  Play,
  RotateCcw,
  Settings,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Sparkles,
  Star,
  Target,
  Trophy,
  Volume2,
  VolumeX,
  Wind,
  X,
  Zap,
} from 'lucide-react'
import { GameCanvas } from './components/GameCanvas'
import { MatchCanvas, type MatchResult } from './components/MatchCanvas'
import { playSound } from './game/audio'
import { getLevel, levels, type Level } from './game/levels'
import { RIVALS, type Rival } from './game/scenarios'

const SAVE_KEY = 'futebolista-kick-save-v2'
type Screen = 'home' | 'journey' | 'locker' | 'missions' | 'game' | 'match'
type LockerTab = 'players' | 'balls'

interface SaveData {
  coins: number
  gems: number
  unlockedLevel: number
  stars: Record<number, number>
  highScores: Record<number, number>
  totalGoals: number
  totalCoins: number
  matchesPlayed: number
  matchWins: number
  equippedSkin: string
  equippedBall: string
  ownedSkins: string[]
  ownedBalls: string[]
  claimedMissions: string[]
  dailyDate: string
  spinDate: string
  sound: boolean
  haptics: boolean
  lowMotion: boolean
}

const defaultSave: SaveData = {
  coins: 420,
  gems: 18,
  unlockedLevel: 1,
  stars: {},
  highScores: {},
  totalGoals: 0,
  totalCoins: 0,
  matchesPlayed: 0,
  matchWins: 0,
  equippedSkin: 'aurora',
  equippedBall: 'classic',
  ownedSkins: ['aurora'],
  ownedBalls: ['classic'],
  claimedMissions: [],
  dailyDate: '',
  spinDate: '',
  sound: true,
  haptics: true,
  lowMotion: false,
}

const skins = [
  { id: 'aurora', name: 'Camisa Aurora', color: '#31d8b4', price: 0, rarity: 'Inicial', note: 'Talento da base' },
  { id: 'striker', name: 'Artilheiro Coral', color: '#ee5d67', price: 550, rarity: 'Raro', note: '+ estilo na finalização' },
  { id: 'royal', name: 'Maestro Real', color: '#7259e8', price: 900, rarity: 'Épico', note: 'Domínio absoluto' },
  { id: 'volt', name: 'Relâmpago', color: '#f4c343', price: 24, gems: true, rarity: 'Lendário', note: 'Energia de campeão' },
]

const balls = [
  { id: 'classic', name: 'Clássica 32', color: '#eef5f7', price: 0, rarity: 'Inicial', note: 'Precisão equilibrada' },
  { id: 'flame', name: 'Bola Vulcão', color: '#ff8b3d', price: 480, rarity: 'Raro', note: 'Deixa rastro de fogo' },
  { id: 'neon', name: 'Pulso Neon', color: '#41e4c1', price: 780, rarity: 'Épico', note: 'Brilha na noite' },
  { id: 'galaxy', name: 'Órbita Roxa', color: '#9d75ee', price: 22, gems: true, rarity: 'Lendário', note: 'De outro planeta' },
]

const navItems: { id: Exclude<Screen, 'game'>; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Início', icon: Home },
  { id: 'journey', label: 'Jornada', icon: Compass },
  { id: 'locker', label: 'Vestiário', icon: Shirt },
  { id: 'missions', label: 'Missões', icon: Target },
]

const todayKey = () => new Date().toISOString().slice(0, 10)

const loadSave = (): SaveData => {
  try {
    const saved = localStorage.getItem(SAVE_KEY)
    return saved ? { ...defaultSave, ...JSON.parse(saved) } : defaultSave
  } catch {
    return defaultSave
  }
}

interface ModalProps {
  children: ReactNode
  onClose?: () => void
  className?: string
}

function Modal({ children, onClose, className = '' }: ModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className={`modal-card ${className}`} role="dialog" aria-modal="true">
        {onClose && <button className="icon-button modal-close" onClick={onClose} aria-label="Fechar"><X size={20} /></button>}
        {children}
      </div>
    </div>
  )
}

function Stars({ count, compact = false }: { count: number; compact?: boolean }) {
  return <span className={`stars ${compact ? 'compact' : ''}`} aria-label={`${count} estrelas`}>{[1, 2, 3].map((star) => <Star key={star} size={compact ? 13 : 20} fill={star <= count ? 'currentColor' : 'none'} className={star <= count ? 'earned' : ''} />)}</span>
}

export default function App() {
  const [save, setSave] = useState<SaveData>(loadSave)
  const [screen, setScreen] = useState<Screen>('home')
  const [activeLevel, setActiveLevel] = useState<Level>(levels[0])
  const [gameKey, setGameKey] = useState(0)
  const [gameResult, setGameResult] = useState<null | { won: boolean; stars: number; score: number; collected: number; reward: number }>(null)
  const [lockerTab, setLockerTab] = useState<LockerTab>('players')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dailyOpen, setDailyOpen] = useState(false)
  const [spinOpen, setSpinOpen] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [spinPrize, setSpinPrize] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [isDailyGame, setIsDailyGame] = useState(false)
  const [rivalPickerOpen, setRivalPickerOpen] = useState(false)
  const [matchRival, setMatchRival] = useState<Rival | null>(null)
  const [matchKey, setMatchKey] = useState(0)
  const [matchResult, setMatchResult] = useState<null | (MatchResult & { reward: number; unlocked: string[]; draw: boolean })>(null)

  const totalStars = useMemo(() => Object.values(save.stars).reduce((sum, value) => sum + value, 0), [save.stars])
  const completedLevels = Object.keys(save.stars).filter((key) => save.stars[Number(key)] > 0).length
  const selectedSkin = skins.find((skin) => skin.id === save.equippedSkin) ?? skins[0]

  useEffect(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save))
  }, [save])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    if (save.dailyDate !== todayKey()) {
      const timeout = window.setTimeout(() => setDailyOpen(true), 700)
      return () => window.clearTimeout(timeout)
    }
  }, [save.dailyDate])

  const goTo = (next: Screen) => {
    playSound('tap', save.sound)
    setMenuOpen(false)
    setScreen(next)
  }

  const startLevel = (level: Level, daily = false) => {
    if (!daily && level.id > save.unlockedLevel) {
      setToast('Complete a fase anterior para desbloquear')
      return
    }
    playSound('tap', save.sound)
    setActiveLevel(level)
    setIsDailyGame(daily)
    setGameResult(null)
    setGameKey((value) => value + 1)
    setScreen('game')
  }

  const handleGameComplete = (result: { won: boolean; stars: number; score: number; collected: number }) => {
    let reward = 0
    if (result.won) {
      const previousStars = save.stars[activeLevel.id] ?? 0
      const firstClear = previousStars === 0
      reward = activeLevel.reward + result.stars * 20 + result.collected * 12 + (isDailyGame ? 150 : 0)
      setSave((current) => ({
        ...current,
        coins: current.coins + reward,
        totalCoins: current.totalCoins + result.collected,
        totalGoals: current.totalGoals + 1,
        unlockedLevel: Math.min(levels.length, Math.max(current.unlockedLevel, activeLevel.id + (firstClear ? 1 : 0))),
        stars: { ...current.stars, [activeLevel.id]: Math.max(previousStars, result.stars) },
        highScores: { ...current.highScores, [activeLevel.id]: Math.max(current.highScores[activeLevel.id] ?? 0, result.score) },
      }))
    }
    setGameResult({ ...result, reward })
  }

  const startMatch = (rival: Rival) => {
    playSound('tap', save.sound)
    setMatchRival(rival)
    setMatchResult(null)
    setMatchKey((value) => value + 1)
    setScreen('match')
  }

  const handleMatchComplete = (result: MatchResult) => {
    const rival = matchRival ?? RIVALS[0]
    const draw = result.userGoals === result.rivalGoals
    const reward = Math.round(
      70 + result.userGoals * 45 + result.coinsCollected * 10 + (result.won ? rival.winReward : draw ? rival.winReward * 0.35 : 0),
    )
    const previousWins = save.matchWins
    const newWins = previousWins + (result.won ? 1 : 0)
    const unlocked = RIVALS.filter((r) => r.unlockWins > previousWins && r.unlockWins <= newWins)
    setSave((current) => ({
      ...current,
      coins: current.coins + reward,
      totalGoals: current.totalGoals + result.userGoals,
      totalCoins: current.totalCoins + result.coinsCollected,
      matchesPlayed: current.matchesPlayed + 1,
      matchWins: newWins,
    }))
    setMatchResult({ ...result, reward, unlocked: unlocked.map((r) => r.name), draw })
    if (unlocked.length > 0) {
      setToast(`Novo rival desbloqueado: ${unlocked.map((r) => r.name).join(', ')}!`)
    }
  }

  const claimDaily = () => {
    setSave((current) => ({ ...current, coins: current.coins + 150, dailyDate: todayKey() }))
    playSound('coin', save.sound)
    setDailyOpen(false)
    setToast('+150 moedas! Recompensa diária coletada')
  }

  const spinWheel = () => {
    if (save.spinDate === todayKey() || spinning) return
    setSpinning(true)
    setSpinPrize(null)
    playSound('tap', save.sound)
    window.setTimeout(() => {
      const daySeed = Number(todayKey().replaceAll('-', ''))
      const prizes = [60, 80, 100, 120, 180, 250]
      const prize = prizes[daySeed % prizes.length]
      setSave((current) => ({ ...current, coins: current.coins + prize, spinDate: todayKey() }))
      setSpinPrize(`+${prize} moedas`)
      setSpinning(false)
      playSound('coin', save.sound)
    }, save.lowMotion ? 450 : 2200)
  }

  const buyOrEquip = (type: LockerTab, item: (typeof skins)[number] | (typeof balls)[number]) => {
    const ownedKey = type === 'players' ? 'ownedSkins' : 'ownedBalls'
    const equippedKey = type === 'players' ? 'equippedSkin' : 'equippedBall'
    const owned = save[ownedKey].includes(item.id)
    if (owned) {
      setSave((current) => ({ ...current, [equippedKey]: item.id }))
      setToast(`${item.name} equipado!`)
      playSound('tap', save.sound)
      return
    }
    const wallet = item.gems ? save.gems : save.coins
    if (wallet < item.price) {
      setToast(item.gems ? 'Gemas insuficientes' : 'Moedas insuficientes')
      return
    }
    setSave((current) => ({
      ...current,
      coins: item.gems ? current.coins : current.coins - item.price,
      gems: item.gems ? current.gems - item.price : current.gems,
      [ownedKey]: [...current[ownedKey], item.id],
      [equippedKey]: item.id,
    }))
    playSound('coin', save.sound)
    setToast(`${item.name} desbloqueado e equipado!`)
  }

  const missions = [
    { id: 'first_goal', icon: Target, title: 'Abra o placar', text: 'Marque seu primeiro gol', current: save.totalGoals, target: 1, reward: 120 },
    { id: 'collector', icon: Coins, title: 'Caça-moedas', text: 'Colete 10 moedas no campo', current: save.totalCoins, target: 10, reward: 180 },
    { id: 'triple', icon: Star, title: 'Olho no lance', text: 'Conquiste 9 estrelas', current: totalStars, target: 9, reward: 220 },
    { id: 'journey_6', icon: Compass, title: 'Na estrada', text: 'Complete 6 fases', current: completedLevels, target: 6, reward: 300 },
    { id: 'match_3', icon: Trophy, title: 'Dono do estádio', text: 'Jogue 3 partidas', current: save.matchesPlayed, target: 3, reward: 200 },
    { id: 'win_2', icon: Crown, title: 'Sequência vencedora', text: 'Vença 2 partidas', current: save.matchWins, target: 2, reward: 350 },
    { id: 'legend', icon: Crown, title: 'Futebolista lendário', text: 'Marque 12 gols', current: save.totalGoals, target: 12, reward: 450 },
  ]

  const claimMission = (id: string, reward: number) => {
    if (save.claimedMissions.includes(id)) return
    setSave((current) => ({ ...current, coins: current.coins + reward, claimedMissions: [...current.claimedMissions, id] }))
    playSound('coin', save.sound)
    setToast(`Missão concluída: +${reward} moedas`)
  }

  if (screen === 'match' && matchRival) {
    return (
      <main className={`game-screen match-screen ${save.lowMotion ? 'reduce-motion' : ''}`}>
        <header className="game-topbar">
          <button className="back-button" onClick={() => { setScreen('home'); setMatchResult(null) }}><ArrowLeft size={19} /><span>Abandonar partida</span></button>
          <div className="game-brand"><span className="brand-mark"><Zap size={17} fill="currentColor" /></span><strong>FUTEBOLISTA</strong><em>KICK</em></div>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Configurações"><Settings size={20} /></button>
        </header>
        <MatchCanvas
          key={matchKey}
          rival={matchRival}
          kitColor={selectedSkin.color}
          ballStyle={save.equippedBall}
          sound={save.sound}
          haptics={save.haptics}
          onMatchComplete={handleMatchComplete}
        />
        {settingsOpen && renderSettings()}
        {matchResult && (
          <Modal className={`result-modal match-result ${matchResult.won ? 'win' : matchResult.draw ? 'draw' : 'lose'}`}>
            <div className="result-burst">{matchResult.won ? <Trophy size={46} /> : matchResult.draw ? <Medal size={42} /> : <RotateCcw size={42} />}</div>
            <span className="result-kicker">FIM DE JOGO</span>
            <h2>{matchResult.won ? 'Vitória no estádio!' : matchResult.draw ? 'Empate apertado' : 'O rival levou esta'}</h2>
            <p className="match-final-score">FUTEBOLISTA <strong>{matchResult.userGoals}</strong> x <strong>{matchResult.rivalGoals}</strong> {matchRival.short}</p>
            <div className="result-stats">
              <span><small>GOLS SEUS</small><strong>{matchResult.userGoals}</strong></span>
              <span><small>PRÊMIO</small><strong><Coins size={16} /> {matchResult.reward}</strong></span>
            </div>
            {matchResult.unlocked.length > 0 && (
              <div className="unlocked-rivals"><Sparkles size={16} /><span>Novo rival: <strong>{matchResult.unlocked.join(', ')}</strong></span></div>
            )}
            <div className="result-actions">
              <button className="secondary-button" onClick={() => { setMatchResult(null); setScreen('home') }}>Sair</button>
              <button className="primary-button" onClick={() => startMatch(matchRival)}>Revanche <ArrowRight size={18} /></button>
            </div>
          </Modal>
        )}
      </main>
    )
  }

  if (screen === 'game') {
    return (
      <main className={`game-screen ${save.lowMotion ? 'reduce-motion' : ''}`}>
        <header className="game-topbar">
          <button className="back-button" onClick={() => { setScreen('journey'); setGameResult(null) }}><ArrowLeft size={19} /><span>Sair da partida</span></button>
          <div className="game-brand"><span className="brand-mark"><Zap size={17} fill="currentColor" /></span><strong>FUTEBOLISTA</strong><em>KICK</em></div>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Configurações"><Settings size={20} /></button>
        </header>
        <div className="game-layout">
          <GameCanvas
            key={gameKey}
            level={activeLevel}
            ballStyle={save.equippedBall}
            kitColor={selectedSkin.color}
            sound={save.sound}
            haptics={save.haptics}
            onComplete={handleGameComplete}
          />
          <aside className="game-objectives">
            <div className="eyebrow"><span /> OBJETIVOS</div>
            <h2>{activeLevel.title}</h2>
            <p>{activeLevel.subtitle}</p>
            <div className="objective-row"><span className="objective-star"><Star size={17} fill="currentColor" /></span><div><strong>Marque o gol</strong><small>Acerte o espaço entre as traves</small></div></div>
            <div className="objective-row"><span className="objective-star"><Star size={17} fill="currentColor" /></span><div><strong>Pegue as moedas</strong><small>Colete {activeLevel.coins.length || 'todas as'} no caminho</small></div></div>
            <div className="objective-row"><span className="objective-star"><Star size={17} fill="currentColor" /></span><div><strong>Seja eficiente</strong><small>Faça uma curva precisa e curta</small></div></div>
            <div className="level-info-panel">
              <span><Wind size={16} /> Vento</span>
              <strong>{activeLevel.wind === 0 ? 'Calmo' : activeLevel.wind > 0 ? 'Para leste' : 'Para oeste'}</strong>
            </div>
            <div className="tip-box"><Sparkles size={18} /><span><strong>Dica profissional</strong>O goleiro lê trajetórias retas. Ataque os cantos.</span></div>
          </aside>
        </div>
        {settingsOpen && renderSettings()}
        {gameResult && (
          <Modal className={`result-modal ${gameResult.won ? 'win' : 'lose'}`}>
            <div className="result-burst">{gameResult.won ? <Trophy size={46} /> : <RotateCcw size={42} />}</div>
            <span className="result-kicker">{gameResult.won ? 'FASE CONCLUÍDA' : 'QUASE LÁ'}</span>
            <h2>{gameResult.won ? 'Gol de cinema!' : 'A defesa venceu esta'}</h2>
            <p>{gameResult.won ? 'Você dobrou a física e encontrou o fundo da rede.' : 'Mude a curva, observe os movimentos e tente novamente.'}</p>
            {gameResult.won && <Stars count={gameResult.stars} />}
            {gameResult.won && <div className="result-stats"><span><small>PONTOS</small><strong>{gameResult.score.toLocaleString('pt-BR')}</strong></span><span><small>PRÊMIO</small><strong><Coins size={16} /> {gameResult.reward}</strong></span></div>}
            <div className="result-actions">
              <button className="secondary-button" onClick={() => { setGameResult(null); setGameKey((value) => value + 1) }}><RotateCcw size={18} /> Repetir</button>
              {gameResult.won && activeLevel.id < levels.length ? (
                <button className="primary-button" onClick={() => startLevel(getLevel(activeLevel.id + 1))}>Próxima fase <ArrowRight size={18} /></button>
              ) : (
                <button className="primary-button" onClick={() => { setGameResult(null); setScreen('journey') }}>Ver jornada <Compass size={18} /></button>
              )}
            </div>
          </Modal>
        )}
      </main>
    )
  }

  function renderSettings() {
    return (
      <Modal onClose={() => setSettingsOpen(false)} className="settings-modal">
        <div className="modal-icon"><Settings size={24} /></div>
        <span className="modal-eyebrow">PREFERÊNCIAS</span>
        <h2>Configurações</h2>
        <p className="modal-subtitle">Deixe a partida com a sua cara.</p>
        <div className="setting-list">
          <button onClick={() => setSave((current) => ({ ...current, sound: !current.sound }))}><span>{save.sound ? <Volume2 size={20} /> : <VolumeX size={20} />}<span><strong>Som do jogo</strong><small>Efeitos de chute e torcida</small></span></span><i className={save.sound ? 'toggle active' : 'toggle'} /></button>
          <button onClick={() => setSave((current) => ({ ...current, haptics: !current.haptics }))}><span><Gamepad2 size={20} /><span><strong>Vibração</strong><small>Resposta tátil nos lances</small></span></span><i className={save.haptics ? 'toggle active' : 'toggle'} /></button>
          <button onClick={() => setSave((current) => ({ ...current, lowMotion: !current.lowMotion }))}><span><Sparkles size={20} /><span><strong>Reduzir movimento</strong><small>Animações mais discretas</small></span></span><i className={save.lowMotion ? 'toggle active' : 'toggle'} /></button>
        </div>
        <button className="primary-button wide" onClick={() => setSettingsOpen(false)}>Salvar preferências</button>
      </Modal>
    )
  }

  const dailyLevel = levels[(new Date().getUTCDate() - 1) % levels.length]
  const screenTitle = navItems.find((item) => item.id === screen)?.label ?? 'Futebolista'

  return (
    <div className={`app-shell ${save.lowMotion ? 'reduce-motion' : ''}`}>
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="logo"><span className="brand-mark"><Zap size={20} fill="currentColor" /></span><span><strong>FUTEBOLISTA</strong><em>KICK</em></span></div>
        <nav>
          <span className="nav-caption">CLUBE</span>
          {navItems.map((item) => <button key={item.id} className={screen === item.id ? 'active' : ''} onClick={() => goTo(item.id)}><item.icon size={20} /><span>{item.label}</span>{item.id === 'missions' && missions.some((mission) => mission.current >= mission.target && !save.claimedMissions.includes(mission.id)) && <i className="nav-alert" />}</button>)}
          <span className="nav-caption extra">SISTEMA</span>
          <button onClick={() => setSettingsOpen(true)}><Settings size={20} /><span>Configurações</span></button>
          <button onClick={() => setToast('O guia interativo estará disponível em breve')}><CircleHelp size={20} /><span>Como jogar</span></button>
        </nav>
        <div className="season-mini"><div className="season-icon"><Trophy size={22} /></div><span><small>TEMPORADA 01</small><strong>Rota ao Estrelato</strong><i><b style={{ width: `${Math.min(100, (totalStars / 36) * 100)}%` }} /></i><em>{totalStars} / 36 estrelas</em></span></div>
        <div className="player-mini"><span className="avatar" style={{ '--kit': selectedSkin.color } as React.CSSProperties}>R</span><span><strong>Rookie 10</strong><small>Nível {Math.max(1, Math.floor(totalStars / 4) + 1)}</small></span><ChevronRight size={17} /></div>
      </aside>

      {menuOpen && <button className="sidebar-scrim" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}

      <section className="main-area">
        <header className="topbar">
          <div className="mobile-title"><button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu /></button><div className="compact-logo"><span className="brand-mark"><Zap size={15} fill="currentColor" /></span><strong>FK</strong></div></div>
          <div className="page-heading"><small>MEU CLUBE</small><strong>{screenTitle}</strong></div>
          <div className="top-actions">
            <span className="wallet"><Coins size={17} /><strong>{save.coins.toLocaleString('pt-BR')}</strong><button aria-label="Obter moedas">+</button></span>
            <span className="wallet gems"><Gem size={16} /><strong>{save.gems}</strong><button aria-label="Obter gemas">+</button></span>
            <button className="icon-button notification" aria-label="Notificações" onClick={() => setToast('Você está em dia! Sem novas notificações.')}><Bell size={19} /><i /></button>
            <button className="profile-button" onClick={() => setSettingsOpen(true)}><span className="avatar small" style={{ '--kit': selectedSkin.color } as React.CSSProperties}>R</span><span><strong>Rookie 10</strong><small>Divisão Bronze</small></span><ChevronRight size={16} /></button>
          </div>
        </header>

        <main className="content">
          {screen === 'home' && (
            <div className="home-page">
              <div className="welcome-row"><div><span className="eyebrow"><span /> CENTRAL DO CLUBE</span><h1>Bom jogo, <em>camisa 10.</em></h1><p>Seu próximo gol impossível começa com um traço.</p></div><div className="streak-pill"><Zap size={18} fill="currentColor" /><span><small>SEQUÊNCIA</small><strong>3 dias</strong></span></div></div>
              <div className="dashboard-grid">
                <section className="hero-card">
                  <div className="hero-shade" />
                  <div className="hero-content"><span className="live-badge"><i /> PARTIDA RÁPIDA</span><h2>Desenhe.<br /><em>Curve.</em> Marque.</h2><p>Faltas, escanteios e pênaltis em momentos aleatórios — como uma partida de verdade, em estádios cheios.</p><div className="hero-meta"><span><Trophy size={17} /> {save.matchWins} vitórias</span><span><Compass size={17} /> {save.matchesPlayed} partidas</span></div><div className="hero-actions"><button className="play-button" onClick={() => setRivalPickerOpen(true)}><Play size={20} fill="currentColor" /> JOGAR AGORA</button><button className="glass-button" onClick={() => goTo('journey')}>Jornada de fases <ChevronRight size={18} /></button></div></div>
                  <div className="hero-progress"><span>PROGRESSO DA TEMPORADA</span><i><b style={{ width: `${Math.min(100, (totalStars / 36) * 100)}%` }} /></i><strong>{Math.round((totalStars / 36) * 100)}%</strong></div>
                </section>
                <section className="daily-card">
                  <div className="daily-top"><span className="card-icon coral"><Target size={20} /></span><span><small>DESAFIO DO DIA</small><strong>{dailyLevel.title}</strong></span><span className="timer">23:41</span></div>
                  <div className="daily-field"><div className="mini-goal" /><span className="mini-ball" /><span className="curve-path" /><div className="daily-reward"><small>RECOMPENSA EXTRA</small><strong><Coins size={16} /> +150</strong></div></div>
                  <p>{dailyLevel.subtitle}. Uma tentativa especial, prêmio dobrado.</p>
                  <button className="outline-button wide" onClick={() => startLevel(dailyLevel, true)}>ACEITAR DESAFIO <ArrowRight size={17} /></button>
                </section>
              </div>
              <div className="section-heading"><div><h2>Atalhos do clube</h2><p>Treine, evolua e volte ainda mais forte.</p></div><button onClick={() => goTo('journey')}>Ver jornada <ArrowRight size={17} /></button></div>
              <div className="quick-grid">
                <button className="quick-card training" onClick={() => startLevel(levels[0])}><span className="quick-icon"><Target /></span><span><small>MODO LIVRE</small><strong>Campo de treino</strong><em>Pratique curvas sem pressão</em></span><i><Play size={18} fill="currentColor" /></i></button>
                <button className="quick-card locker" onClick={() => goTo('locker')}><span className="quick-icon"><Palette /></span><span><small>PERSONALIZAÇÃO</small><strong>Vestiário</strong><em>{save.ownedSkins.length + save.ownedBalls.length} itens desbloqueados</em></span><i><ChevronRight size={18} /></i></button>
                <button className="quick-card wheel" onClick={() => { setSpinPrize(null); setSpinOpen(true) }}><span className="quick-icon"><Gift /></span><span><small>PRÊMIO GRÁTIS</small><strong>Giro da sorte</strong><em>{save.spinDate === todayKey() ? 'Volte amanhã' : '1 giro disponível'}</em></span><i><ChevronRight size={18} /></i></button>
              </div>
            </div>
          )}

          {screen === 'journey' && (
            <div className="journey-page">
              <div className="page-intro"><div><span className="eyebrow"><span /> CAMPANHA</span><h1>Sua jornada ao <em>estrelato</em></h1><p>Conquiste arenas, desbloqueie distritos e vire uma lenda.</p></div><div className="journey-summary"><span><Trophy size={19} /><small>CONCLUÍDAS</small><strong>{completedLevels}/{levels.length}</strong></span><span><Star size={19} /><small>ESTRELAS</small><strong>{totalStars}/36</strong></span></div></div>
              {Array.from(new Set(levels.map((level) => level.chapter))).map((chapter, chapterIndex) => {
                const chapterLevels = levels.filter((level) => level.chapter === chapter)
                const chapterStars = chapterLevels.reduce((sum, level) => sum + (save.stars[level.id] ?? 0), 0)
                return <section className="chapter" key={chapter}><div className="chapter-heading"><span className={`chapter-number chapter-${chapterIndex + 1}`}>{String(chapterIndex + 1).padStart(2, '0')}</span><div><small>DISTRITO {chapterIndex + 1}</small><h2>{chapter}</h2></div><span className="chapter-stars"><Star size={16} fill="currentColor" /> {chapterStars}/{chapterLevels.length * 3}</span></div><div className="level-grid">{chapterLevels.map((level) => {
                  const locked = level.id > save.unlockedLevel
                  const starsEarned = save.stars[level.id] ?? 0
                  return <button key={level.id} className={`level-card theme-${level.theme} ${locked ? 'locked' : ''} ${level.id === save.unlockedLevel ? 'current' : ''}`} onClick={() => startLevel(level)}><div className="level-art"><span className="level-number">{locked ? <Lock size={17} /> : level.id}</span><div className="pitch-lines"><i /><b /></div><span className="level-ball" /><span className="level-goal" />{level.id === save.unlockedLevel && <em className="current-tag">ATUAL</em>}</div><div className="level-copy"><span><small>{level.difficulty.toUpperCase()}</small><Stars count={starsEarned} compact /></span><strong>{level.title}</strong><p>{locked ? 'Complete a fase anterior' : level.subtitle}</p><i className="level-reward"><Coins size={14} /> {level.reward}</i></div></button>
                })}</div></section>
              })}
            </div>
          )}

          {screen === 'locker' && (
            <div className="locker-page">
              <div className="page-intro"><div><span className="eyebrow"><span /> PERSONALIZAÇÃO</span><h1>Vista o seu <em>estilo</em></h1><p>Monte uma identidade única para entrar em campo.</p></div></div>
              <div className="locker-layout">
                <section className="player-preview"><div className="preview-lights"><i /><i /></div><div className="preview-stage"><div className="big-player" style={{ '--kit': selectedSkin.color } as React.CSSProperties}><i className="head" /><i className="body" /><i className="arm left" /><i className="arm right" /><i className="leg left" /><i className="leg right" /></div><span className={`preview-ball ball-${save.equippedBall}`} /></div><div className="equipped-info"><small>VISUAL EQUIPADO</small><strong>{selectedSkin.name}</strong><span><ShieldCheck size={16} /> Pronto para jogar</span></div></section>
                <section className="locker-shop"><div className="tab-list"><button className={lockerTab === 'players' ? 'active' : ''} onClick={() => setLockerTab('players')}><Shirt size={18} /> Jogadores</button><button className={lockerTab === 'balls' ? 'active' : ''} onClick={() => setLockerTab('balls')}><span className="ball-icon" /> Bolas</button></div><div className="cosmetic-grid">{(lockerTab === 'players' ? skins : balls).map((item) => {
                  const owned = (lockerTab === 'players' ? save.ownedSkins : save.ownedBalls).includes(item.id)
                  const equipped = (lockerTab === 'players' ? save.equippedSkin : save.equippedBall) === item.id
                  return <article className={`cosmetic-card ${equipped ? 'equipped' : ''}`} key={item.id}><div className={`cosmetic-art ${lockerTab === 'balls' ? 'ball-art' : ''}`} style={{ '--item': item.color } as React.CSSProperties}>{lockerTab === 'players' ? <span className="jersey"><b>10</b></span> : <span className={`shop-ball ball-${item.id}`} />}{equipped && <i className="equipped-check"><Check size={14} /></i>}</div><div className="cosmetic-copy"><small className={`rarity ${item.rarity.toLowerCase()}`}>{item.rarity}</small><strong>{item.name}</strong><p>{item.note}</p><button className={equipped ? 'equipped-button' : 'buy-button'} onClick={() => buyOrEquip(lockerTab, item)}>{equipped ? <><Check size={15} /> Equipado</> : owned ? 'Equipar' : <>{item.gems ? <Gem size={15} /> : <Coins size={15} />} {item.price}</>}</button></div></article>
                })}</div></section>
              </div>
            </div>
          )}

          {screen === 'missions' && (
            <div className="missions-page">
              <div className="page-intro"><div><span className="eyebrow"><span /> OBJETIVOS</span><h1>Missões do <em>clube</em></h1><p>Cada lance conta. Complete desafios e abasteça seu vestiário.</p></div><div className="mission-total"><Medal size={25} /><span><small>CONCLUÍDAS</small><strong>{save.claimedMissions.length}/{missions.length}</strong></span></div></div>
              <div className="missions-layout"><section className="mission-list"><div className="mission-list-heading"><h2>Metas de carreira</h2><span>PROGRESSO SALVO AUTOMATICAMENTE</span></div>{missions.map((mission) => {
                const complete = mission.current >= mission.target
                const claimed = save.claimedMissions.includes(mission.id)
                const progress = Math.min(100, (mission.current / mission.target) * 100)
                return <article className={`mission-card ${complete ? 'complete' : ''} ${claimed ? 'claimed' : ''}`} key={mission.id}><span className="mission-icon"><mission.icon size={21} /></span><div className="mission-copy"><span><strong>{mission.title}</strong>{claimed && <em><Check size={13} /> COLETADA</em>}</span><p>{mission.text}</p><div className="mission-progress"><i><b style={{ width: `${progress}%` }} /></i><span>{Math.min(mission.current, mission.target)} / {mission.target}</span></div></div><div className="mission-prize"><small>PRÊMIO</small><strong><Coins size={15} /> {mission.reward}</strong><button disabled={!complete || claimed} onClick={() => claimMission(mission.id, mission.reward)}>{claimed ? 'Feito' : complete ? 'Coletar' : 'Em progresso'}</button></div></article>
              })}</section><aside className="rank-card"><span className="rank-glow" /><Crown size={44} /><small>RANK DA TEMPORADA</small><h2>Promessa</h2><p>Faltam <strong>{Math.max(0, 12 - totalStars)} estrelas</strong> para chegar à divisão Craque.</p><div className="rank-progress"><i><b style={{ width: `${Math.min(100, (totalStars / 12) * 100)}%` }} /></i><span>Nível {Math.max(1, Math.floor(totalStars / 4) + 1)}</span></div><div className="next-reward"><Gift size={20} /><span><small>PRÓXIMA RECOMPENSA</small><strong>Baú de 250 moedas</strong></span></div><button className="outline-button wide" onClick={() => goTo('journey')}>CONQUISTAR ESTRELAS</button></aside></div>
            </div>
          )}
        </main>
      </section>

      <nav className="mobile-nav">{navItems.map((item) => <button key={item.id} className={screen === item.id ? 'active' : ''} onClick={() => goTo(item.id)}><item.icon size={20} /><span>{item.label}</span></button>)}</nav>

      {dailyOpen && (
        <Modal onClose={() => setDailyOpen(false)} className="daily-modal">
          <div className="daily-rays" />
          <div className="gift-box"><Gift size={40} /></div>
          <span className="modal-eyebrow">BÔNUS DE RETORNO</span><h2>Bom ter você de volta!</h2><p>Seu treino de hoje já começou com vantagem.</p><div className="daily-prize"><Coins size={30} /><span><small>RECOMPENSA DO DIA</small><strong>150 moedas</strong></span></div><div className="week-row">{['S', 'T', 'Q', 'Q', 'S'].map((day, index) => <span key={`${day}-${index}`} className={index < 3 ? 'done' : index === 3 ? 'today' : ''}><small>{day}</small><i>{index < 3 ? <Check size={14} /> : index === 3 ? <Coins size={14} /> : '?'}</i></span>)}</div><button className="primary-button wide" onClick={claimDaily}>COLETAR RECOMPENSA</button>
        </Modal>
      )}
      {spinOpen && (
        <Modal onClose={() => !spinning && setSpinOpen(false)} className="spin-modal">
          <span className="modal-eyebrow">PRÊMIO DIÁRIO</span><h2>Giro da sorte</h2><p>Um prêmio garantido a cada dia.</p><div className="wheel-pointer" /><div className={`prize-wheel ${spinning ? 'spinning' : ''}`}><span>60</span><span>100</span><span>250</span><span>80</span><span>180</span><span>120</span><i><Zap size={24} fill="currentColor" /></i></div>{spinPrize && <div className="spin-winner"><Sparkles size={18} /> Você ganhou <strong>{spinPrize}!</strong></div>}<button className="primary-button wide" disabled={save.spinDate === todayKey() || spinning} onClick={spinWheel}>{spinning ? 'GIRANDO...' : save.spinDate === todayKey() ? 'VOLTE AMANHÃ' : 'GIRAR AGORA'}</button>
        </Modal>
      )}
      {rivalPickerOpen && (
        <Modal onClose={() => setRivalPickerOpen(false)} className="rival-modal">
          <div className="modal-icon"><Trophy size={24} /></div>
          <span className="modal-eyebrow">PARTIDA RÁPIDA</span>
          <h2>Escolha o rival</h2>
          <p className="modal-subtitle">Faltas, escanteios, pênaltis e mais — tudo aleatório, como uma partida de verdade. Vença para liberar rivais mais fortes.</p>
          <div className="rival-list">
            {RIVALS.map((rival) => {
              const locked = save.matchWins < rival.unlockWins
              const dots = 1 + Math.round(rival.keeperSkill * 4)
              return (
                <button key={rival.id} className={`rival-row ${locked ? 'locked' : ''}`} onClick={() => { if (!locked) { setRivalPickerOpen(false); startMatch(rival) } }}>
                  <span className="rival-badge" style={{ background: rival.kit, color: '#0a1c22' }}>{rival.short}</span>
                  <span className="rival-copy"><strong>{rival.name}</strong><small>{rival.tier}</small></span>
                  <span className="rival-diff">{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= dots ? 'on' : ''} />)}</span>
                  {locked ? <span className="rival-lock"><Lock size={14} /> {rival.unlockWins} vit.</span> : <ChevronRight size={18} />}
                </button>
              )
            })}
          </div>
        </Modal>
      )}
      {settingsOpen && renderSettings()}
      {toast && <div className="toast"><Check size={18} /><span>{toast}</span></div>}
    </div>
  )
}
