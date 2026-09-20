/**
 * Download offline vendor payloads required by the Windows installer.
 * Runs at *build* time only — the resulting Setup.exe does not need network.
 *
 * Currently:
 * - Official unmodified PawnIO_setup.exe (silent install during NSIS)
 *   https://github.com/namazso/PawnIO.Setup/releases
 */
const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const http = require('node:http')
const { URL } = require('node:url')

const ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'vendor', 'PawnIO')
const OUT_FILE = path.join(OUT_DIR, 'PawnIO_setup.exe')
const VERSION = process.env.WATCHX_PAWNIO_VERSION || '2.2.0'
const SOURCE_URL =
  process.env.WATCHX_PAWNIO_URL ||
  `https://github.com/namazso/PawnIO.Setup/releases/download/${VERSION}/PawnIO_setup.exe`

function getProxyUrl() {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    ''
  )
}

function request(urlString, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) {
      reject(new Error(`Too many redirects fetching ${urlString}`))
      return
    }
    const url = new URL(urlString)
    const proxy = getProxyUrl()
    const isHttps = url.protocol === 'https:'
    const lib = isHttps ? https : http

    /** @type {import('https').RequestOptions} */
    const options = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: {
        'User-Agent': 'WatchX-fetch-vendor',
        Accept: '*/*',
      },
      timeout: 120_000,
    }

    let req
    if (proxy) {
      const proxyUrl = new URL(proxy)
      const proxyLib = proxyUrl.protocol === 'https:' ? https : http
      // HTTP CONNECT-style via absolute URL on proxy (common local proxies)
      req = proxyLib.request(
        {
          protocol: proxyUrl.protocol,
          hostname: proxyUrl.hostname,
          port: proxyUrl.port || (proxyUrl.protocol === 'https:' ? 443 : 80),
          path: urlString,
          method: 'GET',
          headers: {
            Host: url.host,
            'User-Agent': 'WatchX-fetch-vendor',
            Accept: '*/*',
          },
          timeout: 120_000,
        },
        (res) => handleResponse(res, urlString, redirects, resolve, reject),
      )
    } else {
      req = lib.request(options, (res) => handleResponse(res, urlString, redirects, resolve, reject))
    }

    req.on('timeout', () => {
      req.destroy(new Error(`Timeout fetching ${urlString}`))
    })
    req.on('error', reject)
    req.end()
  })
}

function handleResponse(res, urlString, redirects, resolve, reject) {
  const status = res.statusCode || 0
  if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
    const next = new URL(res.headers.location, urlString).toString()
    res.resume()
    request(next, redirects + 1).then(resolve, reject)
    return
  }
  if (status < 200 || status >= 300) {
    res.resume()
    reject(new Error(`HTTP ${status} fetching ${urlString}`))
    return
  }
  const chunks = []
  res.on('data', (c) => chunks.push(c))
  res.on('end', () => resolve(Buffer.concat(chunks)))
  res.on('error', reject)
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  if (fs.existsSync(OUT_FILE) && fs.statSync(OUT_FILE).size > 1_000_000) {
    console.log(`[vendor] reuse ${OUT_FILE} (${fs.statSync(OUT_FILE).size} bytes)`)
    return
  }

  console.log(`[vendor] downloading PawnIO ${VERSION}`)
  console.log(`[vendor] ${SOURCE_URL}`)
  if (getProxyUrl()) console.log(`[vendor] proxy ${getProxyUrl()}`)

  const buf = await request(SOURCE_URL)
  if (buf.length < 1_000_000) {
    throw new Error(`Downloaded PawnIO installer looks too small (${buf.length} bytes)`)
  }
  fs.writeFileSync(OUT_FILE, buf)
  fs.writeFileSync(
    path.join(OUT_DIR, 'README.txt'),
    [
      'Official unmodified PawnIO installer (bundled for offline Watch X setup).',
      `Version: ${VERSION}`,
      `Source: ${SOURCE_URL}`,
      'Redistribute only the official installer unmodified.',
      'Silent install: PawnIO_setup.exe -install -silent',
      '',
    ].join('\n'),
  )
  console.log(`[vendor] wrote ${OUT_FILE} (${buf.length} bytes)`)
}

main().catch((error) => {
  console.error('[vendor] FAILED', error instanceof Error ? error.message : error)
  console.error('[vendor] Place PawnIO_setup.exe manually under vendor/PawnIO/ and re-run.')
  process.exit(1)
})
