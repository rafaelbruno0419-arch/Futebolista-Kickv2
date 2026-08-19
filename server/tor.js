// Conexão com o Tor: proxy SOCKS5, requisições anônimas, status e novo circuito.
//
// Toda requisição sai pelo SocksPort do Tor (padrão 127.0.0.1:9050).
// Usamos "socks5h" para que o DNS seja resolvido pelo próprio Tor — isso é
// obrigatório para endereços .onion, que não existem no DNS público.

import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { SocksProxyAgent } from 'socks-proxy-agent'

const TOR_HOST = process.env.TOR_PROXY_HOST || '127.0.0.1'
const TOR_PORT = process.env.TOR_PROXY_PORT || '9050'
const CONTROL_HOST = process.env.TOR_CONTROL_HOST || '127.0.0.1'
const CONTROL_PORT = parseInt(process.env.TOR_CONTROL_PORT || '9051', 10)
const CONTROL_PASSWORD = process.env.TOR_CONTROL_PASSWORD || ''

const proxyUrl = `socks5h://${TOR_HOST}:${TOR_PORT}`

let agent = null
try {
  agent = new SocksProxyAgent(proxyUrl)
} catch {
  agent = null
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; rv:115.0) Gecko/20100101 Firefox/115.0'

/**
 * Requisição HTTP(S) crua através do proxy SOCKS do Tor.
 */
export function rawRequest(url, opts = {}) {
  const {
    method = 'GET',
    headers = {},
    body = null,
    timeout = 30000,
    maxBytes = 8 * 1024 * 1024,
  } = opts

  return new Promise((resolve, reject) => {
    let u
    try {
      u = new URL(url)
    } catch {
      return reject(new Error('URL inválida'))
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return reject(new Error('Protocolo não suportado (apenas http/https)'))
    }

    const lib = u.protocol === 'https:' ? https : http
    const req = lib.request(
      u,
      {
        method,
        agent,
        headers: {
          'User-Agent': UA,
          Accept: '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          ...headers,
        },
        timeout,
      },
      (res) => {
        const chunks = []
        let size = 0
        let aborted = false
        res.on('data', (c) => {
          size += c.length
          if (size > maxBytes) {
            aborted = true
            req.destroy(new Error('Resposta muito grande'))
            return
          }
          chunks.push(c)
        })
        res.on('end', () => {
          if (!aborted) {
            resolve({
              status: res.statusCode || 0,
              headers: res.headers,
              body: Buffer.concat(chunks),
            })
          }
        })
        res.on('error', reject)
      },
    )

    req.on('timeout', () => req.destroy(new Error('Tempo esgotado (timeout)')))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

/**
 * Requisição com seguimento de redirecionamentos (até `redirects` pulos).
 */
export async function fetchTor(url, opts = {}, redirects = 6) {
  let current = url
  for (let i = 0; i <= redirects; i++) {
    const res = await rawRequest(current, opts)
    const status = res.status
    if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
      current = new URL(res.headers.location, current).toString()
      continue
    }
    return { ...res, finalUrl: current }
  }
  throw new Error('Muitos redirecionamentos')
}

export function friendlyError(err) {
  const msg = (err && err.message) || String(err)
  const code = err && err.code
  if (code === 'ECONNREFUSED' || /ECONNREFUSED/i.test(msg)) {
    return `Tor não está acessível em ${TOR_HOST}:${TOR_PORT}. Inicie o Tor no Termux com "tor" (ou "tor &").`
  }
  if (code === 'ETIMEDOUT' || /timeout|Tempo esgotado|timed out/i.test(msg)) {
    return 'A conexão com o Tor demorou demais. Verifique se o Tor está rodando e se a rede está estável.'
  }
  if (code === 'ENOTFOUND' || /ENOTFOUND/i.test(msg)) {
    return 'Falha ao resolver o endereço através do Tor. Confirme que o proxy usa DNS remoto (socks5h).'
  }
  if (code === 'ECONNRESET' || /ECONNRESET/i.test(msg)) {
    return 'A conexão foi reiniciada pelo circuito Tor. Tente "Nova identidade" e tente de novo.'
  }
  if (/too large|muito grande/i.test(msg)) {
    return 'A resposta foi grande demais para ser processada.'
  }
  return msg
}

/**
 * Checa se o Tor está funcionando e qual é o IP do nó de saída.
 */
export async function checkStatus() {
  const started = Date.now()
  // Fonte oficial: check.torproject.org/api/ip → { "IsTor": true, "IP": "..." }
  try {
    const res = await fetchTor('https://check.torproject.org/api/ip', {}, 2)
    const json = JSON.parse(res.body.toString('utf8'))
    return {
      tor: true,
      isTor: Boolean(json.IsTor),
      exitIp: typeof json.IP === 'string' ? json.IP : null,
      latencyMs: Date.now() - started,
      error: null,
    }
  } catch (e) {
    // Fallback: só o IP de saída, sem confirmação oficial.
    try {
      const res = await fetchTor('https://api.ipify.org/?format=json', {}, 2)
      const json = JSON.parse(res.body.toString('utf8'))
      return {
        tor: true,
        isTor: null,
        exitIp: json.ip || null,
        latencyMs: Date.now() - started,
        error: null,
      }
    } catch (e2) {
      return {
        tor: false,
        isTor: null,
        exitIp: null,
        latencyMs: null,
        error: friendlyError(e2),
      }
    }
  }
}

/**
 * Pede ao Tor um novo circuito (SIGNAL NEWNYM) via ControlPort.
 * Requer "ControlPort 9051" no torrc (e a senha, se configurada).
 */
export function newNym() {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: CONTROL_HOST, port: CONTROL_PORT })
    let buf = ''
    let stage = 'AUTH'
    let settled = false

    const finish = (ok, message) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      sock.destroy()
      resolve({ ok, message })
    }

    const timer = setTimeout(
      () => finish(false, 'Tempo esgotado falando com o ControlPort'),
      8000,
    )

    sock.setEncoding('utf8')
    sock.setTimeout(8000, () => finish(false, 'Tempo esgotado no ControlPort'))

    sock.on('connect', () => {
      if (CONTROL_PASSWORD) {
        sock.write(`AUTHENTICATE "${CONTROL_PASSWORD.replace(/"/g, '')}"\r\n`)
      } else {
        sock.write('AUTHENTICATE\r\n')
      }
    })

    sock.on('data', (d) => {
      buf += d
      const lines = buf.split(/\r?\n/)
      buf = lines.pop() || ''
      for (const raw of lines) {
        const line = raw.trim()
        if (!line) continue
        if (stage === 'AUTH') {
          if (line.startsWith('250')) {
            stage = 'NYM'
            sock.write('SIGNAL NEWNYM\r\n')
          } else if (line.startsWith('5')) {
            finish(false, line.slice(4).trim() || 'Falha de autenticação no ControlPort')
          }
        } else if (stage === 'NYM') {
          if (line.startsWith('250')) {
            finish(true, 'Novo circuito solicitado ao Tor')
          } else if (line.startsWith('5')) {
            finish(false, line.slice(4).trim() || 'Falha ao pedir novo circuito')
          }
        }
      }
    })

    sock.on('error', (e) => {
      if (e.code === 'ECONNREFUSED') {
        finish(false, `ControlPort fechado em ${CONTROL_HOST}:${CONTROL_PORT}. Habilite "ControlPort 9051" no torrc.`)
      } else {
        finish(false, e.message)
      }
    })

    sock.on('close', () => {
      if (!settled) finish(false, 'ControlPort fechou a conexão')
    })
  })
}
