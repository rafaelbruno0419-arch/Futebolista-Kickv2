import { useEffect, useRef, useState, useCallback } from 'react'
import { SolarEngine, type Marker, AUW } from './sim/engine'
import { BODIES, BODY_MAP, AU, KM } from './sim/data'
import { daysSinceJ2000 } from './sim/kepler'

const TIME_STEPS = [
  { label: '−1 ano/s', v: -365 },
  { label: '−1 mês/s', v: -30 },
  { label: '−1 dia/s', v: -1 },
  { label: 'Tempo real', v: 1 / 86400 },
  { label: '1 h/s', v: 1 / 24 },
  { label: '1 dia/s', v: 1 },
  { label: '1 semana/s', v: 7 },
  { label: '1 mês/s', v: 30 },
  { label: '1 ano/s', v: 365 },
  { label: '10 anos/s', v: 3650 },
]

function fmtDist(km: number) {
  if (km >= AU * 0.05) return `${(km / AU).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} UA`
  if (km >= 1e6) return `${(km / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} milhões de km`
  return `${Math.round(km).toLocaleString('pt-BR')} km`
}

const KIND_PRIORITY: Record<string, number> = { star: 0, planet: 1, dwarf: 2, comet: 3, moon: 4 }

/**
 * Evita rótulos sobrepostos: percorre do mais importante (estrela/planeta, e o
 * focado) para o menos, descartando quem cai perto demais de um já aceito.
 */
function declutter(markers: Marker[]): Marker[] {
  const vis = markers.filter((m) => m.visible)
  vis.sort((a, b) => {
    if (a.focused !== b.focused) return a.focused ? -1 : 1
    const pk = KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]
    if (pk !== 0) return pk
    return a.dist - b.dist
  })
  const kept: Marker[] = []
  for (const m of vis) {
    const minX = m.kind === 'moon' ? 78 : 96
    const minY = 17
    let clash = false
    for (const k of kept) {
      if (Math.abs(k.x - m.x) < minX && Math.abs(k.y - m.y) < minY) {
        clash = true
        break
      }
    }
    if (!clash) kept.push(m)
  }
  // desenha os distantes primeiro para que os próximos fiquem por cima
  return kept.sort((a, b) => b.dist - a.dist)
}

const KIND_LABEL: Record<string, string> = {
  star: 'Estrela',
  planet: 'Planeta',
  moon: 'Lua',
  dwarf: 'Planeta anão',
  comet: 'Cometa',
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<SolarEngine | null>(null)
  const [markers, setMarkers] = useState<Marker[]>([])
  const [focus, setFocus] = useState('earth')
  const [selected, setSelected] = useState<string | null>('earth')
  const [date, setDate] = useState(new Date())
  const [fps, setFps] = useState(60)
  const [paused, setPaused] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(5)
  const [planetScale, setPlanetScale] = useState(1)
  const [realScale, setRealScale] = useState(false)
  const [showOrbits, setShowOrbits] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const isCompact = () => typeof window !== 'undefined' && (window.innerWidth <= 860 || window.innerHeight <= 560)
  const [compact, setCompact] = useState(isCompact)
  const [uiHidden, setUiHidden] = useState(false) // modo foto (botão / tecla H)
  const [listOpen, setListOpen] = useState(!isCompact())
  const [infoOpen, setInfoOpen] = useState(!isCompact())
  const [booted, setBooted] = useState(false)
  const [dist, setDist] = useState(0)
  const [speedKmS, setSpeedKmS] = useState(0)
  const [sunDist, setSunDist] = useState(0)

  useEffect(() => {
    if (!mountRef.current) return
    const engine = new SolarEngine(mountRef.current)
    engineRef.current = engine
    if (import.meta.env.DEV) (window as any).__engine = engine
    engine.onMarkers = setMarkers
    engine.onTick = (i) => {
      setDate(i.date)
      setFps(i.fps)
      setDist(i.focusDist / KM)
    }
    engine.onPick = (id) => {
      if (id) {
        setSelected(id)
        setFocus(id)
        engine.focusBody(id)
        setInfoOpen(true)
      }
    }
    const ro = new ResizeObserver(() => engine.resize())
    ro.observe(mountRef.current)
    const onResize = () => {
      engine.resize()
      setCompact(window.innerWidth <= 860 || window.innerHeight <= 560)
    }
    window.addEventListener('resize', onResize)
    const t = setTimeout(() => setBooted(true), 900)

    const stats = setInterval(() => {
      const f = engineRef.current?.state.focus
      if (!f) return
      setSpeedKmS(engineRef.current!.speedKmS(f))
      setSunDist(engineRef.current!.distanceKm(f, 'sun'))
    }, 250)

    return () => {
      clearTimeout(t)
      clearInterval(stats)
      ro.disconnect()
      window.removeEventListener('resize', onResize)
      engine.dispose()
    }
  }, [])

  const setEngineFocus = useCallback((id: string) => {
    setFocus(id)
    setSelected(id)
    engineRef.current?.focusBody(id)
  }, [])

  useEffect(() => {
    const e = engineRef.current
    if (!e) return
    e.state.paused = paused
    e.state.timeScale = TIME_STEPS[speedIdx].v
    e.state.planetScale = planetScale
    e.state.realScale = realScale
    e.state.showOrbits = showOrbits
  }, [paused, speedIdx, planetScale, realScale, showOrbits])

  // atalhos de teclado
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.tagName === 'INPUT') return
      if (ev.code === 'Space') {
        ev.preventDefault()
        setPaused((p) => !p)
      } else if (ev.key === '.') setSpeedIdx((i) => Math.min(TIME_STEPS.length - 1, i + 1))
      else if (ev.key === ',') setSpeedIdx((i) => Math.max(0, i - 1))
      else if (ev.key.toLowerCase() === 'o') setShowOrbits((s) => !s)
      else if (ev.key.toLowerCase() === 'l') setShowLabels((s) => !s)
      else if (ev.key.toLowerCase() === 'r') setRealScale((s) => !s)
      else if (ev.key.toLowerCase() === 'h') setUiHidden((s) => !s)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const body = selected ? BODY_MAP.get(selected) : null
  const planets = BODIES.filter((b) => b.kind === 'planet' || b.kind === 'star' || b.kind === 'dwarf' || b.kind === 'comet')
  const moons = BODIES.filter((b) => b.kind === 'moon')

  return (
    <div className={`app ${compact ? 'compact' : ''}`}>
      <div className="viewport" ref={mountRef} />

      {showLabels && (
        <div className="markers">
          {declutter(markers)
            .map((m) => (
              <button
                key={m.id}
                className={`marker ${m.focused ? 'is-focus' : ''} kind-${m.kind}`}
                style={{ transform: `translate(${m.x}px, ${m.y}px)`, ['--c' as any]: m.color }}
                onClick={() => {
                  setEngineFocus(m.id)
                  setInfoOpen(true)
                }}
              >
                <span className="dot" />
                <span className="label">{m.name}</span>
              </button>
            ))}
        </div>
      )}

      {uiHidden && (
        <button className="showui" onClick={() => setUiHidden(false)} title="Mostrar interface (H)">
          Mostrar UI
        </button>
      )}

      {!uiHidden && (
      <header className="topbar">
        <div className="brand">
          <span className="logo" />
          <div>
            <h1>Solar System 3D</h1>
            <p>Simulador realista em tempo real</p>
          </div>
        </div>
        <div className="clock">
          <div className="date">
            {date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </div>
          <div className="time">
            {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
          </div>
        </div>
        <div className="topActions">
          <button className="ghost" onClick={() => setListOpen((s) => !s)} title="Lista de corpos">
            {listOpen ? 'Fechar lista' : 'Corpos'}
          </button>
          <button className="ghost" onClick={() => setUiHidden(true)} title="Modo foto (H)">
            Ocultar UI
          </button>
        </div>
      </header>
      )}

      {!uiHidden && listOpen && (
        <aside className="sidebar">
          <div className="card">
            <h2>Corpos</h2>
            <div className="chips">
              {planets.map((b) => (
                <button
                  key={b.id}
                  className={`chip ${focus === b.id ? 'active' : ''}`}
                  style={{ ['--c' as any]: b.color }}
                  onClick={() => setEngineFocus(b.id)}
                >
                  <i />
                  {b.name}
                </button>
              ))}
            </div>
            <h3>Luas</h3>
            <div className="chips small">
              {moons.map((b) => (
                <button
                  key={b.id}
                  className={`chip ${focus === b.id ? 'active' : ''}`}
                  style={{ ['--c' as any]: b.color }}
                  onClick={() => setEngineFocus(b.id)}
                >
                  <i />
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>Visualização</h2>
            <label className="row">
              <span>Tamanho dos corpos</span>
              <strong>{realScale ? 'real' : `${planetScale.toFixed(0)}×`}</strong>
            </label>
            <input
              type="range"
              min={1}
              max={60}
              step={1}
              value={planetScale}
              disabled={realScale}
              onChange={(e) => setPlanetScale(+e.target.value)}
            />
            <div className="toggles">
              <button className={`toggle ${realScale ? 'on' : ''}`} onClick={() => setRealScale((s) => !s)}>
                Escala real (R)
              </button>
              <button className={`toggle ${showOrbits ? 'on' : ''}`} onClick={() => setShowOrbits((s) => !s)}>
                Órbitas (O)
              </button>
              <button className={`toggle ${showLabels ? 'on' : ''}`} onClick={() => setShowLabels((s) => !s)}>
                Rótulos (L)
              </button>
            </div>
          </div>
        </aside>
      )}

      {!uiHidden && body && infoOpen && (
        <section className="infopanel">
          <button className="close" onClick={() => setInfoOpen(false)} aria-label="Fechar">
            ×
          </button>
          <div className="ihead" style={{ ['--c' as any]: body.color }}>
            <span className="ibadge">{KIND_LABEL[body.kind]}</span>
            <h2>{body.name}</h2>
          </div>
          <p className="fact">{body.fact}</p>
          <dl className="stats">
            <div>
              <dt>Raio</dt>
              <dd>{body.radius.toLocaleString('pt-BR')} km</dd>
            </div>
            <div>
              <dt>Massa</dt>
              <dd>{body.mass}</dd>
            </div>
            <div>
              <dt>Gravidade</dt>
              <dd>{body.gravity}</dd>
            </div>
            <div>
              <dt>Temperatura</dt>
              <dd>{body.temp}</dd>
            </div>
            <div>
              <dt>Dia</dt>
              <dd>{body.day}</dd>
            </div>
            <div>
              <dt>Ano</dt>
              <dd>{body.year}</dd>
            </div>
            <div>
              <dt>Luas</dt>
              <dd>{body.moons}</dd>
            </div>
            <div>
              <dt>Descoberta</dt>
              <dd>{body.discovered}</dd>
            </div>
          </dl>
          <div className="live">
            <div>
              <span>Distância do Sol</span>
              <strong>{fmtDist(sunDist)}</strong>
            </div>
            <div>
              <span>Velocidade orbital</span>
              <strong>{speedKmS.toFixed(2)} km/s</strong>
            </div>
            <div>
              <span>Altitude da câmera</span>
              <strong>{fmtDist(Math.max(dist, 0))}</strong>
            </div>
          </div>
        </section>
      )}

      {!uiHidden && body && !infoOpen && (
        <button className="reopen" onClick={() => setInfoOpen(true)} style={{ ['--c' as any]: body.color }}>
          <i />
          {body.name}
        </button>
      )}

      {!uiHidden && (
        <footer className="timebar">
          <button className="play" onClick={() => setPaused((p) => !p)} title="Espaço">
            {paused ? '▶' : '❚❚'}
          </button>
          <button className="step" onClick={() => setSpeedIdx((i) => Math.max(0, i - 1))} title=",">
            ◀◀
          </button>
          <div className="speed">
            <span>{TIME_STEPS[speedIdx].label}</span>
            <input
              type="range"
              min={0}
              max={TIME_STEPS.length - 1}
              step={1}
              value={speedIdx}
              onChange={(e) => setSpeedIdx(+e.target.value)}
            />
          </div>
          <button className="step" onClick={() => setSpeedIdx((i) => Math.min(TIME_STEPS.length - 1, i + 1))} title=".">
            ▶▶
          </button>
          <button
            className="ghost"
            onClick={() => {
              engineRef.current?.setTime(daysSinceJ2000(new Date()))
              setSpeedIdx(5)
            }}
          >
            Hoje
          </button>
          <span className="fps">{fps.toFixed(0)} fps</span>
        </footer>
      )}

      <div className={`boot ${booted ? 'done' : ''}`}>
        <div className="bootInner">
          <div className="ring" />
          <h2>Solar System 3D</h2>
          <p>Calculando órbitas keplerianas…</p>
        </div>
      </div>

      {!uiHidden && <div className="hint">Arraste para orbitar · rolagem/pinça para zoom · clique num corpo para focar</div>}
    </div>
  )
}
