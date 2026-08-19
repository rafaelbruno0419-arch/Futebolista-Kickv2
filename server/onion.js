// Visualizador de páginas .onion: busca o HTML através do Tor e reescreve os
// links/recursos para continuarem passando pelo proxy. Assim dá para navegar
// (de forma limitada) em sites .onion direto pela interface, sem o Tor Browser.

import { fetchTor } from './tor.js'
import { escapeAttr } from './util.js'

const MAX_BYTES = 20 * 1024 * 1024

export function isOnionHost(host) {
  return typeof host === 'string' && /\.onion$/i.test(host) && host.length > 6
}

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

const ATTR_RE =
  /(\s)(href|src|action|poster)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi

function rewriteUrl(raw, baseUrl, proxyPath) {
  if (!raw) return null
  const trimmed = raw.trim()
  if (
    !trimmed ||
    /^(#|javascript:|data:|mailto:|tel:|blob:|about:)/i.test(trimmed)
  ) {
    return null
  }
  let resolved
  try {
    resolved = new URL(trimmed, baseUrl)
  } catch {
    return null
  }
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null
  return `${proxyPath}?url=${encodeURIComponent(resolved.toString())}`
}

export function rewriteHtml(html, baseUrl, proxyPath) {
  let out = html

  // Reescreve atributos de URL (links, imagens, css, scripts, formulários...).
  out = out.replace(ATTR_RE, (match, sp, attr, whole, dq, sq, bare) => {
    const raw = dq ?? sq ?? bare
    const proxied = rewriteUrl(raw, baseUrl, proxyPath)
    if (!proxied) return match
    const quote = whole ? whole[0] : '"'
    return `${sp}${attr}=${quote}${escapeAttr(proxied)}${quote}`
  })

  // Reescreve srcset (listas "url 1x, url 2x").
  out = out.replace(
    /(\ssrcset\s*=\s*)(["'])([^"']*)\2/gi,
    (match, pre, quote, value) => {
      const items = value
        .split(',')
        .map((part) => {
          const bits = part.trim().split(/\s+/)
          const u = bits[0]
          const rest = bits.slice(1).join(' ')
          const proxied = rewriteUrl(u, baseUrl, proxyPath)
          if (!proxied) return part
          return rest ? `${proxied} ${rest}` : proxied
        })
        .join(', ')
      return `${pre}${quote}${items}${quote}`
    },
  )

  // Injeta <base> para que qualquer URL relativa que não tenha sido reescrita
  // (ex.: url() dentro de CSS inline) ainda aponte para o destino original.
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(
      /<head([^>]*)>/i,
      `<head$1><base href="${escapeAttr(baseUrl)}">`,
    )
  } else if (/<html[^>]*>/i.test(out)) {
    out = out.replace(
      /<html([^>]*)>/i,
      `<html$1><head><base href="${escapeAttr(baseUrl)}"></head>`,
    )
  } else {
    out = `<head><base href="${escapeAttr(baseUrl)}"></head>` + out
  }

  // Remove meta refresh (redirecionaria fora do proxy).
  out = out.replace(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '')

  return out
}

export async function proxyOnion(url, proxyPath = '/api/proxy') {
  let u
  try {
    u = new URL(url)
  } catch {
    throw httpError(400, 'URL inválida.')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw httpError(400, 'Apenas endereços http/https são suportados.')
  }
  if (!isOnionHost(u.hostname)) {
    throw httpError(
      400,
      'Este visualizador abre apenas endereços .onion. Para a web comum, use a aba de busca.',
    )
  }

  const res = await fetchTor(u.toString(), {
    headers: {
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    },
    maxBytes: MAX_BYTES,
  })

  const type = String(res.headers['content-type'] || '')
    .split(';')[0]
    .trim()
    .toLowerCase()

  // Recursos não-HTML (imagens, css, fontes...) passam direto.
  if (type && type !== 'text/html' && type !== 'application/xhtml+xml') {
    return {
      passthrough: true,
      contentType: res.headers['content-type'] || 'application/octet-stream',
      body: res.body,
    }
  }

  const html = rewriteHtml(res.body.toString('utf8'), res.finalUrl, proxyPath)
  return {
    passthrough: false,
    contentType: 'text/html; charset=utf-8',
    body: Buffer.from(html),
    finalUrl: res.finalUrl,
  }
}
