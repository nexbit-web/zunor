import { describe, it, expect, beforeEach, vi } from 'vitest'

// Превʼю посилань: сервер сам іде за адресою з чату. Головне тут — SSRF:
// жодна адреса з повідомлення не повинна довести сервер до localhost,
// внутрішньої мережі чи метаданих хмари (169.254.169.254). Справжньої
// мережі в тестах немає: DNS підмінений, а все, що відсікається до
// підключення, до сокета не доходить.

const { dnsLookup } = vi.hoisted(() => ({ dnsLookup: vi.fn() }))
vi.mock('node:dns', () => ({
  lookup: dnsLookup,
  default: { lookup: dnsLookup },
}))

const { isPublicAddress, parseLinkPreview, fetchLinkPreview, publicLookup } =
  await import('$lib/server/link-preview')

type Resolved = { address: string; family: number }[]
function resolvesTo(...ips: string[]) {
  const addresses: Resolved = ips.map((address) => ({
    address,
    family: address.includes(':') ? 6 : 4,
  }))
  dnsLookup.mockImplementation((_host, _opts, cb) => cb(null, addresses))
}

beforeEach(() => {
  dnsLookup.mockReset()
})

describe('які адреси публічні', () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '2001:db8::1',
    '2002:7f00:1::1',
  ]) {
    it(`${ip} — ні`, () => expect(isPublicAddress(ip)).toBe(false))
  }

  for (const ip of [
    '8.8.8.8',
    '172.32.0.1',
    '91.198.174.192',
    '2a00:1450:4001:80b::200e',
  ]) {
    it(`${ip} — так`, () => expect(isPublicAddress(ip)).toBe(true))
  }

  it('імʼя хоста — не адреса', () => {
    expect(isPublicAddress('example.com')).toBe(false)
  })
})

describe('адреси, до яких сервер навіть не підключається', () => {
  for (const link of [
    'http://127.0.0.1/',
    'http://[::1]/',
    'http://169.254.169.254/latest/meta-data/',
    'http://0x7f000001/',
    'http://2130706433/',
    'http://10.0.0.1/admin',
    'https://example.com:8443/',
    'http://example.com:5432/',
    'https://user:pass@example.com/',
    'ftp://example.com/file',
    'http://localhost/',
    'http://api.localhost/',
    'http://intranet/',
  ]) {
    it(link, async () => {
      expect(await fetchLinkPreview(link)).toBeNull()
      expect(dnsLookup).not.toHaveBeenCalled()
    })
  }

  it('задовге посилання — без картки', async () => {
    const link = `https://example.com/${'a'.repeat(3000)}`
    expect(await fetchLinkPreview(link)).toBeNull()
    expect(dnsLookup).not.toHaveBeenCalled()
  })
})

describe('DNS: перевіряється адреса, до якої підключаємось', () => {
  const lookup = (opts: { all?: boolean } = { all: true }) =>
    new Promise<{ err: unknown; address: unknown }>((resolve) =>
      publicLookup('site.example', opts as never, (err, address) =>
        resolve({ err, address }),
      ),
    )

  it('імʼя у внутрішню мережу — відмова', async () => {
    resolvesTo('10.0.0.5')
    const { err } = await lookup()
    expect(err).toBeInstanceOf(Error)
  })

  // Інакше запис «публічна + приватна» грав би на порядку перебору.
  it('хоч одна приватна серед публічних — відмова', async () => {
    resolvesTo('8.8.8.8', '127.0.0.1')
    const { err } = await lookup()
    expect(err).toBeInstanceOf(Error)
  })

  it('публічні — пропускає як є', async () => {
    resolvesTo('8.8.8.8', '2a00:1450:4001:80b::200e')
    expect(await lookup({ all: true })).toEqual({
      err: null,
      address: [
        { address: '8.8.8.8', family: 4 },
        { address: '2a00:1450:4001:80b::200e', family: 6 },
      ],
    })
    expect(await lookup({ all: false })).toEqual({
      err: null,
      address: '8.8.8.8',
    })
  })

  it('справжній запит іде через цю перевірку, і відмова кешується', async () => {
    resolvesTo('192.168.0.10')
    const link = 'https://router.example/'

    expect(await fetchLinkPreview(link)).toBeNull()
    expect(dnsLookup).toHaveBeenCalledTimes(1)

    // Вдруге — з кешу, без нового резолву.
    expect(await fetchLinkPreview(link)).toBeNull()
    expect(dnsLookup).toHaveBeenCalledTimes(1)
  })
})

describe('розбір <head>', () => {
  const page = (head: string, body = '') =>
    `<!doctype html><html><head>${head}</head><body>${body}</body></html>`

  it('Open Graph важливіший за <title>', () => {
    const html = page(`
      <title>Головна — Магазин</title>
      <meta property="og:title" content="Пилосос Dyson V15">
      <meta property="og:description" content="Бездротовий, 60 хв роботи">
      <meta property="og:site_name" content="Rozetka">`)

    expect(parseLinkPreview(html, 'https://rozetka.com.ua/p/1')).toEqual({
      url: 'https://rozetka.com.ua/p/1',
      siteName: 'Rozetka',
      title: 'Пилосос Dyson V15',
      description: 'Бездротовий, 60 хв роботи',
    })
  })

  it('без OG — <title> і звичайний description', () => {
    const html = page(`
      <title>Інтернет-банк | Приват24</title>
      <meta name="description" content="Усі фінансові послуги за кілька кліків">`)

    expect(parseLinkPreview(html, 'https://privat24.ua/')).toMatchObject({
      title: 'Інтернет-банк | Приват24',
      description: 'Усі фінансові послуги за кілька кліків',
    })
  })

  it('назва сайту — з адреси після редіректів, без www', () => {
    const html = page('<title>Приват24</title>')
    const p = parseLinkPreview(
      html,
      'https://pb.ua/short?5Z1QZ',
      'https://www.next.privat24.ua/',
    )
    expect(p?.siteName).toBe('next.privat24.ua')
    // Відкривається те, що написали в чаті, а не кінцева адреса.
    expect(p?.url).toBe('https://pb.ua/short?5Z1QZ')
  })

  it('атрибути в будь-якому порядку й лапках', () => {
    const html = page(
      `<meta content='Прибирання після ремонту' property='og:title' />`,
    )
    expect(parseLinkPreview(html, 'https://a.ua')?.title).toBe(
      'Прибирання після ремонту',
    )
  })

  it('сутності розкодовані, пробіли зведені', () => {
    const html = page(
      `<title>  Tom &amp; Jerry&#39;s &#x2014; &laquo;кіно&raquo;\n\n  </title>`,
    )
    expect(parseLinkPreview(html, 'https://a.ua')?.title).toBe(
      "Tom & Jerry's — «кіно»",
    )
  })

  it('bidi-перемикачі й керуючі символи — геть', () => {
    const html = page(`<title>Оплата‮gnp.exe\u0007</title>`)
    expect(parseLinkPreview(html, 'https://a.ua')?.title).toBe('Оплата gnp.exe')
  })

  it('довгий заголовок обрізаний', () => {
    const html = page(`<title>${'а'.repeat(500)}</title>`)
    const title = parseLinkPreview(html, 'https://a.ua')!.title
    expect(title.length).toBe(200)
    expect(title.endsWith('…')).toBe(true)
  })

  it('мета з <script> і <body> не читається', () => {
    const html = page(
      `<script>var t = '<meta property="og:title" content="Підробка">'</script>
       <title>Справжній</title>`,
      '<meta property="og:description" content="З тіла">',
    )
    expect(parseLinkPreview(html, 'https://a.ua')).toMatchObject({
      title: 'Справжній',
      description: '',
    })
  })

  it('ні заголовка, ні опису — картки немає', () => {
    expect(
      parseLinkPreview(page('<meta charset="utf-8">'), 'https://a.ua'),
    ).toBeNull()
    expect(parseLinkPreview('', 'https://a.ua')).toBeNull()
  })
})
