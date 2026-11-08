// Превʼю посилання в чаті — картка «сайт · заголовок · опис», як у Telegram.
//
// Сервер сам іде за адресою, яку написав у чаті користувач, — а це
// класична діра SSRF: «http://127.0.0.1:5432», «http://169.254.169.254/»
// (метадані хмари) чи імʼя, що резолвиться у внутрішню мережу. Тому:
//   • лише http(s), лише стандартні порти, без логіна в адресі;
//   • адреса перевіряється ПІСЛЯ DNS і саме та, до якої підключаємось
//     (`lookup` усередині запиту). Перевірка імені окремо від підключення
//     обходиться DNS-rebinding'ом: перший резолв публічний, другий — ні;
//   • редіректи — вручну, кожен крок перевіряється заново;
//   • тайм-аут на все разом і стеля на розмір: читаємо лише <head>.
//
// Картинки в превʼю немає навмисно: її вантажив би браузер співрозмовника
// напряму з чужого сервера — піксель-трекер, що віддає IP і час
// прочитання тому, хто скинув посилання (Telegram для цього проксує
// картинки через себе).
//
// Модуль не знає про чат і базу — лише «адреса → картка». Запис у
// повідомлення й розсилка — у $lib/server/chat-link-preview.

import { lookup as dnsLookup } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'
import type { Readable } from 'node:stream'
import zlib from 'node:zlib'
import type { LinkPreview } from '$lib/components/chat/types'

const TIMEOUT_MS = 5_000
const MAX_BYTES = 512 * 1024
const MAX_REDIRECTS = 4
const MAX_LINK_LENGTH = 2048

const TITLE_MAX = 200
const DESCRIPTION_MAX = 300
const SITE_MAX = 80

// Кеш у памʼяті процесу — зі стелею, як усе в ньому (AGENTS.md, 2.1).
const CACHE_MAX = 500
const TTL_FOUND = 6 * 60 * 60_000
const TTL_MISSING = 30 * 60_000
/** Скільки сайтів можемо чекати одночасно; понад це — без картки. */
const MAX_INFLIGHT = 20

// ═══════════════════════ Які адреси публічні ═══════════════════════

const PRIVATE = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, тут же метадані хмар
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // зарезервовані й broadcast
] as const) {
  PRIVATE.addSubnet(net, prefix, 'ipv4')
}
// IPv6 — навпаки, від дозволеного: лише глобальний unicast 2000::/3, і з
// нього геть документацію, Teredo й 6to4 (останні два вкладають IPv4
// всередину, зокрема й 127.0.0.1).
const GLOBAL_V6 = new BlockList()
GLOBAL_V6.addSubnet('2000::', 3, 'ipv6')
for (const [net, prefix] of [
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
] as const) {
  PRIVATE.addSubnet(net, prefix, 'ipv6')
}

/** Чи можна серверу йти на цю IP-адресу. Не IP — ні. */
export function isPublicAddress(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) return !PRIVATE.check(ip, 'ipv4')
  if (version === 6) {
    return GLOBAL_V6.check(ip, 'ipv6') && !PRIVATE.check(ip, 'ipv6')
  }
  return false
}

/** Адреса, яку взагалі варто пробувати, — ще до DNS. */
function isAllowedUrl(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (url.username || url.password) return false
  // URL сам прибирає явний стандартний порт (:80 / :443) — будь-який
  // інший тут означає чужий сервіс на тому ж хості.
  if (url.port) return false
  const host = url.hostname.replace(/^\[|\]$/g, '')
  // IP у адресі підключається без DNS — `lookup` його не побачить.
  if (isIP(host)) return isPublicAddress(host)
  return host.includes('.') && !host.endsWith('.localhost')
}

/**
 * DNS-резолв, що відмовляє, коли ХОЧ ОДНА адреса непублічна: інакше
 * запис із публічною й приватною адресою грав би на порядку перебору.
 * Експортований для тестів.
 */
export const publicLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(
    hostname,
    { all: true, family: options.family ?? 0 },
    (err, addresses) => {
      if (err) return callback(err, '', 0)
      if (
        !addresses.length ||
        !addresses.every((a) => isPublicAddress(a.address))
      ) {
        const blocked = Object.assign(new Error(`blocked: ${hostname}`), {
          code: 'EBLOCKED',
        })
        return callback(blocked, '', 0)
      }
      if (options.all) return callback(null, addresses)
      callback(null, addresses[0].address, addresses[0].family)
    },
  )
}

// ═══════════════════════ Завантаження ═══════════════════════

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (compatible; ZunorLinkPreview/1.0)',
  accept: 'text/html,application/xhtml+xml;q=0.9',
  'accept-language': 'uk,ru;q=0.8,en;q=0.6',
  'accept-encoding': 'gzip, deflate, br',
}

type Hop =
  | { kind: 'redirect'; location: string }
  | { kind: 'html'; html: string }
  | { kind: 'none' }

function unpack(res: http.IncomingMessage): Readable {
  switch ((res.headers['content-encoding'] ?? '').toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return res.pipe(zlib.createGunzip())
    case 'deflate':
      return res.pipe(zlib.createInflate())
    case 'br':
      return res.pipe(zlib.createBrotliDecompress())
    default:
      return res
  }
}

function decodeHtml(body: Buffer, contentType: string): string {
  const label =
    /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(
      body.subarray(0, 4096).toString('latin1'),
    )?.[1] ??
    'utf-8'
  try {
    return new TextDecoder(label).decode(body)
  } catch {
    return new TextDecoder('utf-8').decode(body)
  }
}

/** Один крок: або редірект, або HTML (лише його початок), або нічого. */
function hop(url: URL, signal: AbortSignal): Promise<Hop> {
  if (!isAllowedUrl(url)) return Promise.resolve({ kind: 'none' })

  return new Promise((resolve) => {
    let done = false
    let res: http.IncomingMessage | null = null
    const settle = (result: Hop) => {
      if (done) return
      done = true
      res?.destroy()
      resolve(result)
    }
    // Обрив за тайм-аутом мусить завершити крок будь-де: на розпакуванні
    // потік інакше просто завис би, а з ним і запис у кеші «в дорозі».
    if (signal.aborted) return settle({ kind: 'none' })
    signal.addEventListener('abort', () => settle({ kind: 'none' }), {
      once: true,
    })

    const lib = url.protocol === 'https:' ? https : http
    const req = lib.request(
      url,
      {
        method: 'GET',
        headers: HEADERS,
        lookup: publicLookup,
        // Без пулу: чуже зʼєднання з тим самим імʼям не мало нашої
        // перевірки адреси.
        agent: false,
        signal,
      },
      (response) => {
        res = response
        const status = response.statusCode ?? 0
        const location = response.headers.location
        if (status >= 300 && status < 400 && location) {
          return settle({ kind: 'redirect', location })
        }
        const type = String(response.headers['content-type'] ?? '')
        if (
          status !== 200 ||
          !/text\/html|application\/xhtml\+xml/i.test(type)
        ) {
          return settle({ kind: 'none' })
        }

        const chunks: Buffer[] = []
        let size = 0
        const finish = () =>
          settle({
            kind: 'html',
            html: decodeHtml(Buffer.concat(chunks), type),
          })
        const body = unpack(response)
        body.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
          size += chunk.length
          // Лічимо РОЗПАКОВАНЕ — gzip-бомба упирається в ту саму стелю.
          if (size >= MAX_BYTES || chunk.includes('</head>')) finish()
        })
        body.on('end', finish)
        body.on('error', () => settle({ kind: 'none' }))
        response.on('error', () => settle({ kind: 'none' }))
      },
    )
    req.on('error', () => settle({ kind: 'none' }))
    req.end()
  })
}

async function download(
  link: string,
): Promise<{ html: string; url: string } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    let url = new URL(link)
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      const step = await hop(url, controller.signal)
      if (step.kind === 'html') return { html: step.html, url: url.href }
      if (step.kind === 'none') return null
      url = new URL(step.location, url)
    }
    return null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

// ═══════════════════════ Розбір <head> ═══════════════════════

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  laquo: '«',
  raquo: '»',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] !== '#') return NAMED_ENTITIES[entity.toLowerCase()] ?? whole
    const hex = entity[1] === 'x' || entity[1] === 'X'
    const code = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10)
    const valid =
      code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
    return valid ? String.fromCodePoint(code) : ''
  })
}

/**
 * Текст для картки: сутності розкодовані, керуючі символи й
 * bidi-перемикачі геть (ними можна «перевернути» сусідній текст),
 * пробіли зведені, довжина обрізана.
 */
function clean(raw: string, max: number): string {
  const text = decodeEntities(raw)
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

const ATTR_RE = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g

function attributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>()
  for (const m of tag.matchAll(ATTR_RE)) {
    attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '')
  }
  return attrs
}

function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * Картка з HTML сторінки: Open Graph → Twitter → звичайні <title> і
 * description. Без заголовка й опису картки немає — сама назва сайту
 * нічого не додає до посилання.
 *
 * @param link    посилання з повідомлення (його й відкриває картка)
 * @param finalUrl куди привели редіректи — з нього назва сайту, якщо
 *                 og:site_name немає (pb.ua/short → next.privat24.ua)
 */
export function parseLinkPreview(
  html: string,
  link: string,
  finalUrl: string = link,
): LinkPreview | null {
  const end = html.search(/<\/head>/i)
  const head = (end === -1 ? html : html.slice(0, end))
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')

  const meta = new Map<string, string>()
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(tag)
    const key = (attrs.get('property') ?? attrs.get('name'))?.toLowerCase()
    const content = attrs.get('content')
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content)
  }

  const title = clean(
    meta.get('og:title') ??
      meta.get('twitter:title') ??
      /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ??
      '',
    TITLE_MAX,
  )
  const description = clean(
    meta.get('og:description') ??
      meta.get('twitter:description') ??
      meta.get('description') ??
      '',
    DESCRIPTION_MAX,
  )
  if (!title && !description) return null

  const siteName =
    clean(meta.get('og:site_name') ?? '', SITE_MAX) || siteOf(finalUrl)
  return { url: link, siteName, title, description }
}

// ═══════════════════════ Кеш і вхід ═══════════════════════

const cache = new Map<string, { preview: LinkPreview | null; until: number }>()
const inflight = new Map<string, Promise<LinkPreview | null>>()

function remember(link: string, preview: LinkPreview | null) {
  cache.delete(link)
  cache.set(link, {
    preview,
    until: Date.now() + (preview ? TTL_FOUND : TTL_MISSING),
  })
  // Map памʼятає порядок вставки — перший ключ найстаріший.
  while (cache.size > CACHE_MAX) {
    cache.delete(cache.keys().next().value!)
  }
}

/**
 * Що вже відомо без мережі: картка, `null` (сайт нещодавно картки не дав)
 * чи `undefined` (ще не ходили). Так повторне посилання отримує картку
 * одразу, разом із самим повідомленням.
 */
export function cachedLinkPreview(
  link: string,
): LinkPreview | null | undefined {
  const hit = cache.get(link)
  if (!hit) return undefined
  if (hit.until < Date.now()) {
    cache.delete(link)
    return undefined
  }
  return hit.preview
}

/** Картка для посилання або `null`. Ніколи не кидає. */
export function fetchLinkPreview(link: string): Promise<LinkPreview | null> {
  if (link.length > MAX_LINK_LENGTH) return Promise.resolve(null)

  const known = cachedLinkPreview(link)
  if (known !== undefined) return Promise.resolve(known)

  const pending = inflight.get(link)
  if (pending) return pending
  // Перевантаження — без картки й без запису в кеш: це не відповідь сайту.
  if (inflight.size >= MAX_INFLIGHT) return Promise.resolve(null)

  const job = download(link)
    .then((page) => (page ? parseLinkPreview(page.html, link, page.url) : null))
    .catch(() => null)
    .then((preview) => {
      remember(link, preview)
      inflight.delete(link)
      return preview
    })
  inflight.set(link, job)
  return job
}
