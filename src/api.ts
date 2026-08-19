import type {
  NewNymResponse,
  SearchEngine,
  SearchResponse,
  TorStatus,
} from './types'

// O app pode falar com o backend servido pelo próprio Termux (mesma origem)
// ou com outro endereço configurado em "Configurações" (ex.: IP do celular
// acessado de um PC na mesma rede).

export function getBase(): string {
  return localStorage.getItem('onionsearch.baseUrl') || ''
}

export function setBase(value: string): void {
  localStorage.setItem('onionsearch.baseUrl', value.trim())
}

export function getToken(): string {
  return localStorage.getItem('onionsearch.authToken') || ''
}

export function setToken(value: string): void {
  localStorage.setItem('onionsearch.authToken', value.trim())
}

function headers(): Record<string, string> {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(getBase() + path, { ...init, headers: { ...headers(), ...init.headers } })
  } catch {
    throw new Error(
      'Não foi possível conectar ao servidor. Verifique o endereço em Configurações e se o app está rodando no Termux.',
    )
  }
  if (res.status === 401) {
    throw new Error('Acesso negado. Confira o token em Configurações.')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || `Erro ${res.status}`)
  }
  return (await res.json()) as T
}

export function fetchStatus(): Promise<TorStatus> {
  return request<TorStatus>('/api/status')
}

export function fetchSearch(
  q: string,
  engine: SearchEngine,
): Promise<SearchResponse> {
  return request<SearchResponse>(
    `/api/search?q=${encodeURIComponent(q)}&engine=${encodeURIComponent(engine)}`,
  )
}

export function fetchNewNym(): Promise<NewNymResponse> {
  return request<NewNymResponse>('/api/newnym', { method: 'POST' })
}

export function proxyHref(url: string): string {
  return `${getBase()}/api/proxy?url=${encodeURIComponent(url)}`
}
