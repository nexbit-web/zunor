import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Content-Security-Policy ставить SvelteKit (svelte.config.js, kit.csp) —
// з одноразовим nonce на кожну сторінку. Доки заголовок збирався руками в
// hooks.server.ts, він мусив дозволяти `script-src 'unsafe-inline'`, а з ним
// CSP від XSS не захищає взагалі: будь-який вставлений <script> виконався б.
//
// Тут стережемо обидві половини: політика не дозволяє вбудованих скриптів,
// а кожен вбудований скрипт у app.html несе nonce — інакше сайт лишився б
// без теми й акценту до першого кадру (або з дірою, якщо хтось «полагодить»
// це через unsafe-inline).

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const { default: config } = (await import('../../svelte.config.js')) as {
  default: { kit: { csp?: { mode?: string; directives?: Record<string, string[]> } } }
}
const directives = config.kit.csp?.directives ?? {}

describe('політика (svelte.config.js)', () => {
  it('скрипти — лише свої й з nonce: жодного unsafe-inline чи unsafe-eval', () => {
    const scripts = directives['script-src'] ?? []
    expect(scripts).toContain('self')
    expect(scripts).not.toContain('unsafe-inline')
    expect(scripts).not.toContain('unsafe-eval')
    expect(scripts).not.toContain('*')
    expect(scripts.some((s) => s === 'https:' || s === 'http:' || s === 'data:')).toBe(false)
  })

  // 'auto' — nonce для сторінок, що рендеряться на запит; саме він і
  // дозволяє власні вбудовані скрипти SvelteKit.
  it('режим — nonce для динамічних сторінок', () => {
    expect(['auto', 'nonce']).toContain(config.kit.csp?.mode)
  })

  it('за замовчуванням — лише свій origin', () => {
    expect(directives['default-src']).toEqual(['self'])
  })

  it('сайт не вбудовується в чужі сторінки й не вбудовує чужі', () => {
    expect(directives['frame-ancestors']).toEqual(['none'])
    expect(directives['frame-src']).toEqual(['none'])
    expect(directives['object-src']).toEqual(['none'])
  })

  it('base і цілі форм — лише свої', () => {
    expect(directives['base-uri']).toEqual(['self'])
    expect(directives['form-action']).toEqual(['self'])
  })

  // Картинки — лише свої й Cloudinary: інакше будь-яке чуже посилання в
  // профілі стає трекінг-пікселем.
  it('картинки — без довільних джерел', () => {
    const images = directives['img-src'] ?? []
    expect(images).toContain('https://res.cloudinary.com')
    expect(images).not.toContain('*')
    expect(images).not.toContain('https:')
    expect(images).not.toContain('http:')
  })

  it('мережеві запити — лише свої, Cloudinary й Pusher', () => {
    const connect = directives['connect-src'] ?? []
    expect(connect).toContain('self')
    expect(connect).not.toContain('*')
    expect(connect).not.toContain('https:')
    expect(connect).not.toContain('wss:')
  })
})

describe('вбудовані скрипти (app.html)', () => {
  const html = read('../app.html').replace(/<!--[\s\S]*?-->/g, '')
  const scripts = html.match(/<script\b[^>]*>/g) ?? []

  it('вони є — і кожен несе nonce сторінки', () => {
    expect(scripts.length).toBeGreaterThan(0)
    for (const tag of scripts) {
      // Зовнішній скрипт (src) nonce не потребує — його пускає 'self'.
      if (/\bsrc=/.test(tag)) continue
      expect(tag).toContain('nonce="%sveltekit.nonce%"')
    }
  })

  it('обробників подій у розмітці немає — nonce їх не покриває', () => {
    expect(html).not.toMatch(/\son[a-z]+\s*=/i)
    expect(html).not.toMatch(/javascript:/i)
  })

  // Скрипт теми mode-watcher вставляється сюди (hooks.server.ts) — у тег із
  // nonce, а не компонентом без нього.
  it('місце під скрипт теми — всередині скрипта з nonce', () => {
    expect(html).toMatch(
      /<script nonce="%sveltekit\.nonce%">\s*%modewatcher\.snippet%\s*<\/script>/,
    )
  })
})

describe('кореневий layout', () => {
  // Інакше <ModeWatcher> вставив би свій <script> без nonce, і браузер
  // заблокував би його з помилкою CSP на кожній сторінці.
  it('ModeWatcher не вставляє власний скрипт у <head>', () => {
    const layout = read('../routes/+layout.svelte')
    expect(layout).toMatch(/<ModeWatcher[^>]*disableHeadScriptInjection/)
  })
})
