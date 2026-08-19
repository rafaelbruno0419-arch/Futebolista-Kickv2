// OnionSearch — servidor web para buscas na deep web via Tor.
//
// Feito para rodar dentro do Termux, junto com o daemon do Tor. Serve a
// interface (dist/) e a API que faz as requisições anônimas via SOCKS5.
//
// Variáveis de ambiente:
//   PORT                  porta do servidor web (padrão 3000)
//   HOST                  interface (padrão 0.0.0.0)
//   TOR_PROXY_HOST/PORT   SocksPort do Tor (padrão 127.0.0.1:9050)
//   TOR_CONTROL_HOST/PORT ControlPort do Tor (padrão 127.0.0.1:9051)
//   TOR_CONTROL_PASSWORD  senha do ControlPort (opcional)
//   AUTH_TOKEN            token de acesso opcional (protege a API/proxy)

import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkStatus, newNym, friendlyError } from './tor.js'
import { searchDuckDuckGo, searchAhmia } from './search.js'
import { proxyOnion } from './onion.js'
import { escapeHtml } from './util.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '256kb' }))

const AUTH_TOKEN = process.env.AUTH_TOKEN || ''

function authOk(req) {
  if (!AUTH_TOKEN) return true
  const header = String(req.headers.authorization || '').replace(
    /^Bearer\s+/i,
    '',
  )
  return header === AUTH_TOKEN || req.query.token === AUTH_TOKEN
}

app.use('/api', (req, res, next) => {
  if (!authOk(req)) {
    return res.status(401).json({ error: 'Acesso negado: token inválido.' })
  }
  next()
})

app.get('/api/status', async (req, res) => {
  try {
    res.json(await checkStatus())
  } catch {
    res.json({ tor: false, isTor: null, exitIp: null, latencyMs: null, error: 'Erro inesperado' })
  }
})

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  const engine = String(req.query.engine || 'duckduckgo')
  if (!q) {
    return res.status(400).json({ error: 'Informe um termo de busca.' })
  }
  try {
    const started = Date.now()
    const results =
      engine === 'ahmia' ? await searchAhmia(q) : await searchDuckDuckGo(q)
    res.json({ query: q, engine, results, tookMs: Date.now() - started })
  } catch (e) {
    res.status(502).json({ error: friendlyError(e) || 'Falha na busca.' })
  }
})

app.post('/api/newnym', async (req, res) => {
  try {
    res.json(await newNym())
  } catch {
    res.json({ ok: false, message: 'Erro inesperado no ControlPort' })
  }
})

app.get('/api/proxy', async (req, res) => {
  const url = String(req.query.url || '').trim()
  if (!url) {
    return res
      .status(400)
      .type('text/html')
      .send(proxyErrorPage('Informe um endereço .onion na URL (?url=...).'))
  }
  try {
    const out = await proxyOnion(url, '/api/proxy')
    res.set('Content-Type', out.contentType)
    res.set('Cache-Control', 'no-store')
    res.send(out.body)
  } catch (e) {
    const status = e.status || 502
    const message = e.status ? e.message : friendlyError(e)
    res.status(status).type('text/html').send(proxyErrorPage(message))
  }
})

function proxyErrorPage(message) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OnionSearch — erro</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0e14;color:#e6e9ef;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;box-sizing:border-box}
  .card{background:#121722;border:1px solid #262d3d;border-radius:14px;padding:28px;max-width:480px;width:100%}
  h1{font-size:18px;margin:0 0 12px;color:#f4a261}
  p{margin:0;line-height:1.6;color:#a9b1c3;font-size:14px}
  a{color:#7f5af0}
</style></head><body>
<div class="card"><h1>⚠️ Não foi possível abrir a página</h1>
<p>${escapeHtml(message || 'Erro desconhecido.')}</p>
<p style="margin-top:12px">Dica: endereços .onion só funcionam com o Tor ativo no Termux.</p>
</div></body></html>`
}

// Frontend compilado (dist/).
const dist = path.join(__dirname, '..', 'dist')
app.use(express.static(dist))

// Fallback SPA: qualquer GET que não seja da API devolve o index.html.
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
  const index = path.join(dist, 'index.html')
  if (fs.existsSync(index)) return res.sendFile(index)
  res
    .status(200)
    .type('text/html')
    .send(
      '<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#0b0e14;color:#e6e9ef;padding:40px">' +
        '<h2>Interface ainda não compilada</h2>' +
        '<p>Rode <code>npm run build</code> (ou use <code>npm run dev</code> para desenvolvimento).</p>' +
        '</body>',
    )
})

const PORT = parseInt(process.env.PORT || '3000', 10)
const HOST = process.env.HOST || '0.0.0.0'

app.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' || HOST === '::' ? 'localhost' : HOST
  console.log('')
  console.log('  🧅 OnionSearch iniciado')
  console.log(`     Interface : http://${shown}:${PORT}`)
  console.log(
    `     Tor SOCKS  : socks5h://${process.env.TOR_PROXY_HOST || '127.0.0.1'}:${process.env.TOR_PROXY_PORT || '9050'}`,
  )
  if (AUTH_TOKEN) console.log('     Proteção  : AUTH_TOKEN ativo (token obrigatório)')
  console.log('')
})
