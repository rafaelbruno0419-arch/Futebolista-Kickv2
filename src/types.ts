export type SearchEngine = 'duckduckgo' | 'ahmia'

export interface SearchResult {
  title: string
  url: string
  snippet: string
  displayUrl?: string
  onion?: boolean
}

export interface SearchResponse {
  query: string
  engine: SearchEngine
  results: SearchResult[]
  tookMs: number
}

export interface TorStatus {
  tor: boolean
  isTor: boolean | null
  exitIp: string | null
  latencyMs: number | null
  error: string | null
}

export interface NewNymResponse {
  ok: boolean
  message: string
}

export interface EngineOption {
  id: SearchEngine
  label: string
  hint: string
  badge: string
}
