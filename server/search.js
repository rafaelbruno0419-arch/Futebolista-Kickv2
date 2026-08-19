// Motores de busca anônimos, executados por trás do proxy SOCKS do Tor.
//
// 1) DuckDuckGo (endpoint HTML) → busca na web indexada, sem rastreamento.
// 2) Ahmia → índice curado de serviços .onion (rede Tor / dark web).
//
// As funções parse* ficam separadas para poderem ser testadas sem rede.

import { fetchTor } from './tor.js'
import { decodeEntities, stripTags } from './util.js'

function dedupe(results) {
  const seen = new Set()
  return results.filter((r) => {
    const key = (r.url || '').toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function parseDuckDuckGo(html) {
  const linkRe =
    /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const snipRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi

  const links = [...html.matchAll(linkRe)]
  const snips = [...html.matchAll(snipRe)]

  const results = links.map((m, i) => {
    const href = decodeEntities(m[1])
    let realUrl = href

    if (/\/l\/\?uddg=/.test(href)) {
      try {
        const base = href.startsWith('//') ? 'https:' + href : href
        const uddg = new URL(base).searchParams.get('uddg')
        if (uddg) realUrl = decodeURIComponent(uddg)
      } catch {
        /* mantém o href original */
      }
    } else if (href.startsWith('//')) {
      realUrl = 'https:' + href
    }

    return {
      title: decodeEntities(stripTags(m[2])) || '(sem título)',
      url: realUrl,
      snippet: snips[i] ? decodeEntities(stripTags(snips[i][1])) : '',
      onion: /\.onion(\/|$)/i.test(realUrl),
    }
  })

  return dedupe(results)
}

export function parseAhmia(html, finalUrl = 'https://ahmia.fi/search/') {
  const results = []
  const blockRe =
    /<li[^>]*class="[^"]*\bresult\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi
  let m
  while ((m = blockRe.exec(html))) {
    const block = m[1]
    const h4 = block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i)
    const link = h4
      ? h4[1].match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
      : null
    const p = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    const cite = block.match(/<cite[^>]*>([\s\S]*?)<\/cite>/i)

    if (!link) continue

    // O Ahmia usa um link de redirecionamento: ...?redirect_url=ENCODED_ONION
    const href = link[1].replace(/&amp;/g, '&')
    let realUrl = href
    try {
      const u = new URL(href, finalUrl)
      const redirect = u.searchParams.get('redirect_url')
      if (redirect) realUrl = decodeURIComponent(redirect)
    } catch {
      /* mantém o href original */
    }

    results.push({
      title: decodeEntities(stripTags(link[2])) || '(sem título)',
      url: realUrl,
      snippet: p ? decodeEntities(stripTags(p[1])) : '',
      displayUrl: cite
        ? decodeEntities(stripTags(cite[1]))
        : (realUrl.match(/^https?:\/\/([^/]+)/i) || [])[1] || realUrl,
      onion: true,
    })
  }

  return dedupe(results)
}

export async function searchDuckDuckGo(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=wt-wt`
  const res = await fetchTor(url, { headers: { Accept: 'text/html' } })
  const html = res.body.toString('utf8')

  // O DuckDuckGo pode devolver um CAPTCHA / página de anomalia para alguns
  // nós de saída do Tor. Detectamos e orientamos o usuário.
  if (!/class="result__a"/.test(html) && /anomaly|challenge|captcha/i.test(html)) {
    throw new Error(
      'O DuckDuckGo pediu uma verificação (CAPTCHA). Use "Nova identidade" para trocar o nó de saída e tente de novo.',
    )
  }

  return parseDuckDuckGo(html)
}

export async function searchAhmia(query) {
  // Endereço .onion oficial do Ahmia (funciona só via Tor).
  const onionUrl =
    'http://juhanurmihxlp77nkq76byazcldy2hlmovfu2epvl5ankdibsot4csyd.onion/search/?q=' +
    encodeURIComponent(query)
  // Espelho clearnet como fallback (o tráfego continua saindo pelo Tor).
  const clearnetUrl = 'https://ahmia.fi/search/?q=' + encodeURIComponent(query)

  let html
  let finalUrl
  try {
    const r = await fetchTor(onionUrl, { headers: { Accept: 'text/html' } }, 3)
    html = r.body.toString('utf8')
    finalUrl = r.finalUrl
  } catch {
    const r = await fetchTor(clearnetUrl, { headers: { Accept: 'text/html' } }, 3)
    html = r.body.toString('utf8')
    finalUrl = r.finalUrl
  }

  return parseAhmia(html, finalUrl)
}
