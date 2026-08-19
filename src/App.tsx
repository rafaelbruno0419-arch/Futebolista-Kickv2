import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react'
import {
  fetchNewNym,
  fetchSearch,
  fetchStatus,
  getBase,
  getToken,
  proxyHref,
  setBase,
  setToken,
} from './api'
import type {
  EngineOption,
  SearchEngine,
  SearchResult,
  SearchResponse,
  TorStatus,
} from './types'

const ENGINES: EngineOption[] = [
  {
    id: 'duckduckgo',
    label: 'DuckDuckGo',
    hint: 'Busca anônima na web indexada, sem rastreamento.',
    badge: 'web anônima',
  },
  {
    id: 'ahmia',
    label: 'Ahmia',
    hint: 'Índice curado de serviços .onion (rede Tor).',
    badge: '.onion',
  },
]

function OnionMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="onionBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c084fc" />
          <stop offset="1" stopColor="#7f5af0" />
        </linearGradient>
        <linearGradient id="onionGold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f4a261" />
          <stop offset="1" stopColor="#e76f51" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0b0e14" />
      <circle cx="32" cy="32" r="24" fill="url(#onionBody)" />
      <path
        d="M32 20c0 0 8 8 8 14a8 8 0 1 1-16 0c0-6 8-14 8-14Z"
        fill="#0b0e14"
        fillOpacity="0.35"
      />
      <ellipse cx="32" cy="34" rx="6" ry="8" fill="url(#onionGold)" />
      <path
        d="M14 18c-2 4-2 8 0 12M50 18c2 4 2 8 0 12"
        stroke="#2cb67d"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function App() {
  const [tab, setTab] = useState<'search' | 'onion'>('search')

  // Status do Tor
  const [status, setStatus] = useState<TorStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [nymMessage, setNymMessage] = useState<string | null>(null)
  const [nymLoading, setNymLoading] = useState(false)

  // Busca
  const [query, setQuery] = useState('')
  const [engine, setEngine] = useState<SearchEngine>('duckduckgo')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [response, setResponse] = useState<SearchResponse | null>(null)

  // Visualizador .onion
  const [onionInput, setOnionInput] = useState('')
  const [onionSrc, setOnionSrc] = useState<string | null>(null)

  // Configurações
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [baseDraft, setBaseDraft] = useState(getBase())
  const [tokenDraft, setTokenDraft] = useState(getToken())

  const toastTimer = useRef<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 4500)
  }, [])

  const loadStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const s = await fetchStatus()
      setStatus(s)
    } catch {
      setStatus({
        tor: false,
        isTor: null,
        exitIp: null,
        latencyMs: null,
        error: 'Falha ao consultar o servidor.',
      })
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
    const id = window.setInterval(loadStatus, 30000)
    return () => window.clearInterval(id)
  }, [loadStatus])

  const runSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()
      const q = query.trim()
      if (!q || searching) return
      setSearching(true)
      setSearchError(null)
      setResponse(null)
      try {
        const res = await fetchSearch(q, engine)
        setResponse(res)
      } catch (err) {
        setSearchError((err as Error).message)
      } finally {
        setSearching(false)
      }
    },
    [query, engine, searching],
  )

  const openOnion = useCallback((raw: string) => {
    const u = raw.trim()
    if (!u) return
    setOnionSrc(null)
    setTab('onion')
    setOnionInput(u)
    setOnionSrc(proxyHref(u))
  }, [])

  const submitOnion = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      openOnion(onionInput)
    },
    [onionInput, openOnion],
  )

  const openResult = useCallback(
    (r: SearchResult) => {
      if (r.onion) {
        openOnion(r.url)
      } else {
        window.open(r.url, '_blank', 'noopener,noreferrer')
      }
    },
    [openOnion],
  )

  const handleNewNym = useCallback(async () => {
    setNymLoading(true)
    setNymMessage(null)
    try {
      const r = await fetchNewNym()
      if (r.ok) {
        showToast('🧅 ' + (r.message || 'Novo circuito criado'))
        await loadStatus()
      } else {
        setNymMessage(r.message || 'Falha ao trocar de identidade')
      }
    } catch (err) {
      setNymMessage((err as Error).message)
    } finally {
      setNymLoading(false)
    }
  }, [loadStatus, showToast])

  const saveSettings = useCallback(() => {
    setBase(baseDraft)
    setToken(tokenDraft)
    setSettingsOpen(false)
    showToast('Configurações salvas. Recarregue o status.')
    loadStatus()
  }, [baseDraft, tokenDraft, loadStatus, showToast])

  const torOk = status?.tor === true

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" onClick={() => setTab('search')}>
          <OnionMark size={34} />
          <div className="brand-text">
            <h1>OnionSearch</h1>
            <p>busca na deep web via Tor · Termux</p>
          </div>
        </div>

        <div className="topbar-actions">
          <StatusPill
            status={status}
            loading={statusLoading}
            onRefresh={loadStatus}
          />
          <button
            className="btn btn-ghost"
            onClick={handleNewNym}
            disabled={nymLoading}
            title="Pedir um novo circuito ao Tor (SIGNAL NEWNYM)"
          >
            {nymLoading ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            Nova identidade
          </button>
          <button
            className="btn btn-icon"
            onClick={() => setSettingsOpen((v) => !v)}
            title="Configurações"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {nymMessage && (
        <div className="banner banner-warn">
          <ShieldAlert size={16} />
          <span>{nymMessage}</span>
          <button
            className="banner-close"
            onClick={() => setNymMessage(null)}
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {settingsOpen && (
        <SettingsPanel
          base={baseDraft}
          token={tokenDraft}
          onBase={setBaseDraft}
          onToken={setTokenDraft}
          onSave={saveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <nav className="tabs">
        <button
          className={`tab ${tab === 'search' ? 'active' : ''}`}
          onClick={() => setTab('search')}
        >
          <Search size={16} /> Buscar
        </button>
        <button
          className={`tab ${tab === 'onion' ? 'active' : ''}`}
          onClick={() => setTab('onion')}
        >
          <Link2 size={16} /> Abrir .onion
        </button>
      </nav>

      <main className="content">
        {tab === 'search' ? (
          <SearchView
            query={query}
            setQuery={setQuery}
            engine={engine}
            setEngine={setEngine}
            searching={searching}
            onSearch={runSearch}
            error={searchError}
            response={response}
            torOk={torOk}
            onOpenResult={openResult}
          />
        ) : (
          <OnionView
            value={onionInput}
            setValue={setOnionInput}
            src={onionSrc}
            onSubmit={submitOnion}
          />
        )}
      </main>

      <footer className="footer">
        <span>
          🔒 Toda requisição sai pelo Tor. Você é anônimo, não invencível — não
          entre com contas pessoais.
        </span>
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function StatusPill({
  status,
  loading,
  onRefresh,
}: {
  status: TorStatus | null
  loading: boolean
  onRefresh: () => void
}) {
  const ok = status?.tor === true
  return (
    <button
      className={`status-pill ${ok ? 'ok' : 'down'}`}
      onClick={onRefresh}
      title={ok ? 'Clique para atualizar' : (status?.error ?? 'Verificando…')}
    >
      {loading ? (
        <Loader2 size={15} className="spin" />
      ) : ok ? (
        <ShieldCheck size={15} />
      ) : (
        <ShieldAlert size={15} />
      )}
      <span className="status-dot" />
      <span className="status-text">
        {loading ? 'Verificando…' : ok ? 'Tor conectado' : 'Tor offline'}
      </span>
      {ok && status?.exitIp && (
        <span className="status-ip">{status.exitIp}</span>
      )}
    </button>
  )
}

function SettingsPanel({
  base,
  token,
  onBase,
  onToken,
  onSave,
  onClose,
}: {
  base: string
  token: string
  onBase: (v: string) => void
  onToken: (v: string) => void
  onSave: () => void
  onClose: () => void
}) {
  return (
    <div className="settings">
      <div className="settings-head">
        <h2>Configurações</h2>
        <button className="btn btn-icon" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>
      </div>
      <label className="field">
        <span>Endereço do servidor (Termux)</span>
        <input
          value={base}
          onChange={(e) => onBase(e.target.value)}
          placeholder="vazio = mesma origem (ex.: http://192.168.0.10:3000)"
        />
        <small>
          Deixe vazio se você abre o site pelo próprio celular. Use o IP do
          celular se estiver acessando de outro aparelho na mesma rede.
        </small>
      </label>
      <label className="field">
        <span>Token de acesso (opcional)</span>
        <input
          value={token}
          onChange={(e) => onToken(e.target.value)}
          placeholder="igual ao AUTH_TOKEN definido no servidor"
        />
      </label>
      <div className="settings-actions">
        <button className="btn btn-primary" onClick={onSave}>
          Salvar
        </button>
      </div>
    </div>
  )
}

function SearchView({
  query,
  setQuery,
  engine,
  setEngine,
  searching,
  onSearch,
  error,
  response,
  torOk,
  onOpenResult,
}: {
  query: string
  setQuery: (v: string) => void
  engine: SearchEngine
  setEngine: (v: SearchEngine) => void
  searching: boolean
  onSearch: (e?: React.FormEvent) => void
  error: string | null
  response: SearchResponse | null
  torOk: boolean
  onOpenResult: (r: SearchResult) => void
}) {
  return (
    <div className="search-view">
      <form className="searchbox" onSubmit={onSearch}>
        <Search size={20} className="searchbox-icon" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquise anonimamente…"
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={searching || !query.trim()}
        >
          {searching ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
          {searching ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      <div className="engine-row">
        {ENGINES.map((e) => (
          <button
            key={e.id}
            className={`engine-chip ${engine === e.id ? 'active' : ''}`}
            onClick={() => setEngine(e.id)}
            title={e.hint}
          >
            <span className="engine-name">{e.label}</span>
            <span className="engine-badge">{e.badge}</span>
          </button>
        ))}
        <span className="engine-hint">
          {ENGINES.find((e) => e.id === engine)?.hint}
        </span>
      </div>

      {!torOk && !searching && (
        <div className="banner banner-warn">
          <ShieldAlert size={16} />
          <span>
            Tor está offline — as buscas vão falhar. Inicie o Tor no Termux (
            <code>tor</code>) e clique em “Nova identidade”.
          </span>
        </div>
      )}

      {error && (
        <div className="banner banner-error">
          <ShieldAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      {response && (
        <div className="results">
          <div className="results-meta">
            <span>
              {response.results.length}{' '}
              {response.results.length === 1 ? 'resultado' : 'resultados'} para{' '}
              <strong>{response.query}</strong>
            </span>
            <span className="muted">em {response.tookMs} ms · via Tor</span>
          </div>

          {response.results.length === 0 ? (
            <div className="empty">
              <Globe size={28} />
              <p>Nenhum resultado encontrado. Tente outros termos.</p>
            </div>
          ) : (
            <ul className="result-list">
              {response.results.map((r, i) => (
                <ResultCard key={i} result={r} onOpen={() => onOpenResult(r)} />
              ))}
            </ul>
          )}
        </div>
      )}

      {!response && !error && !searching && (
        <div className="hero-hint">
          <Lock size={20} />
          <p>
            Digite um termo e escolha o motor.{' '}
            <strong>DuckDuckGo</strong> busca a web indexada sem rastrear você;{' '}
            <strong>Ahmia</strong> busca serviços ocultos <code>.onion</code>.
            Todo o tráfego sai pelo Tor.
          </p>
        </div>
      )}
    </div>
  )
}

function ResultCard({
  result,
  onOpen,
}: {
  result: SearchResult
  onOpen: () => void
}) {
  const host = useMemo(() => {
    try {
      return new URL(result.url).hostname
    } catch {
      return result.displayUrl || result.url
    }
  }, [result])

  return (
    <li className="result-card">
      <div className="result-main">
        <button className="result-title" onClick={onOpen}>
          {result.title}
        </button>
        {result.snippet && <p className="result-snippet">{result.snippet}</p>}
      </div>
      <div className="result-foot">
        <span className={`result-host ${result.onion ? 'onion' : ''}`}>
          {result.onion && <Link2 size={13} />}
          {host}
        </span>
        {result.onion ? (
          <button className="result-open" onClick={onOpen}>
            Abrir no visualizador <ExternalLink size={13} />
          </button>
        ) : (
          <button className="result-open" onClick={onOpen}>
            Abrir <ExternalLink size={13} />
          </button>
        )}
      </div>
    </li>
  )
}

function OnionView({
  value,
  setValue,
  src,
  onSubmit,
}: {
  value: string
  setValue: (v: string) => void
  src: string | null
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <div className="onion-view">
      <form className="searchbox onion-bar" onSubmit={onSubmit}>
        <Globe size={20} className="searchbox-icon" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="http://xxxxxxxxxxxxxxx.onion"
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
          Abrir
        </button>
      </form>

      <p className="onion-note">
        Cole um endereço <code>.onion</code>. A página é baixada e exibida aqui,
        passando pelo Tor. Navegação limitada (JavaScript/complexos podem não
        funcionar) — para uso completo, prefira o Tor Browser.
      </p>

      {src ? (
        <iframe
          className="onion-frame"
          src={src}
          title="Visualizador .onion"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="empty">
          <Globe size={28} />
          <p>Nenhuma página aberta ainda.</p>
        </div>
      )}
    </div>
  )
}
