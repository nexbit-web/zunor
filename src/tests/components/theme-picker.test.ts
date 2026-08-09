import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import {
  SETTINGS_SECTIONS,
  DEFAULT_SECTION,
  sectionsForRole,
} from '$lib/components/settings/nav'

const mode = vi.hoisted(() => ({
  userPrefersMode: { current: 'system' as string | undefined },
  setMode: vi.fn((v: string) => {
    mode.userPrefersMode.current = v
  }),
}))

vi.mock('mode-watcher', () => mode)

const ThemePicker = (
  await import('$lib/components/settings/theme-picker.svelte')
).default

// Вибір теми — це радіогрупа, і саме тому вона тут перевіряється
// клавіатурою, а не лише кліком. role="radio" без стрілок — обіцянка, якої
// компонент не виконує: скрінрідер оголошує радіогрупу, а стрілки не
// роблять нічого. Це вже було.
//
// Друга властивість: «Системна» — третій режим, а не тумблер над першими
// двома. Тому підсвічувати треба ВИБІР користувача (userPrefersMode), а не
// обчислену тему (mode) — інакше при 'system' горіла б не та картка.

const options = (c: HTMLElement) => [
  ...c.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
]

const selected = (c: HTMLElement) =>
  options(c).find((b) => b.getAttribute('aria-checked') === 'true')

beforeEach(() => {
  mode.setMode.mockClear()
  mode.userPrefersMode.current = 'system'
})

describe('розмітка радіогрупи', () => {
  it('три варіанти в порядку macOS: світла, темна, системна', () => {
    const { container } = render(ThemePicker)

    expect(options(container).map((b) => b.textContent?.trim())).toEqual([
      'Світла',
      'Темна',
      'Системна',
    ])
  })

  it('група підписана для скрінрідера', () => {
    const { container } = render(ThemePicker)

    expect(
      container
        .querySelector('[role="radiogroup"]')
        ?.getAttribute('aria-label'),
    ).toBeTruthy()
  })

  // «Світла» без контексту нічого не пояснює — тому в кожної кнопки
  // розгорнутий aria-label.
  it('кожен варіант має власне пояснення', () => {
    const { container } = render(ThemePicker)

    for (const b of options(container)) {
      expect(b.getAttribute('aria-label')).toMatch(/тема/i)
    }
  })

  it('кнопки не сабмітять форму, в якій лежать', () => {
    const { container } = render(ThemePicker)

    for (const b of options(container)) {
      expect(b.getAttribute('type')).toBe('button')
    }
  })
})

describe('підсвітка вибраного', () => {
  it('обрано те, що вибрав користувач', () => {
    mode.userPrefersMode.current = 'dark'
    const { container } = render(ThemePicker)

    expect(selected(container)?.textContent?.trim()).toBe('Темна')
  })

  // Головна пастка: 'system' — повноцінний третій варіант.
  it('при «системній» горить саме вона, а не обчислена тема', () => {
    mode.userPrefersMode.current = 'system'
    const { container } = render(ThemePicker)

    expect(selected(container)?.textContent?.trim()).toBe('Системна')
  })

  it('без збереженого вибору за замовчуванням «системна»', () => {
    mode.userPrefersMode.current = undefined
    const { container } = render(ThemePicker)

    expect(selected(container)?.textContent?.trim()).toBe('Системна')
  })

  it('обрана рівно одна картка', () => {
    mode.userPrefersMode.current = 'light'
    const { container } = render(ThemePicker)

    expect(
      options(container).filter(
        (b) => b.getAttribute('aria-checked') === 'true',
      ),
    ).toHaveLength(1)
  })

  it('галочка стоїть тільки на обраній', () => {
    mode.userPrefersMode.current = 'light'
    const { container } = render(ThemePicker)

    const [light, dark] = options(container)
    expect(light.querySelector('svg[data-icon]')).not.toBeNull()
    expect(dark.querySelector('svg[data-icon]')).toBeNull()
  })
})

describe('roving tabindex', () => {
  // Три кнопки поспіль змушували б тричі тиснути Tab, щоб проминути блок.
  it('у групу один вхід табом', () => {
    mode.userPrefersMode.current = 'dark'
    const { container } = render(ThemePicker)

    const tabbable = options(container).filter(
      (b) => b.getAttribute('tabindex') === '0',
    )
    expect(tabbable).toHaveLength(1)
    expect(tabbable[0].textContent?.trim()).toBe('Темна')
  })

  it('решта кнопок з табу виключені', () => {
    const { container } = render(ThemePicker)

    const skipped = options(container).filter(
      (b) => b.getAttribute('tabindex') === '-1',
    )
    expect(skipped).toHaveLength(2)
  })
})

describe('клавіатура', () => {
  it('стрілка вправо перемикає на наступну', async () => {
    mode.userPrefersMode.current = 'light'
    const { container } = render(ThemePicker)

    await fireEvent.keyDown(options(container)[0], { key: 'ArrowRight' })

    expect(mode.setMode).toHaveBeenCalledWith('dark')
  })

  it('стрілка вліво — на попередню', async () => {
    mode.userPrefersMode.current = 'dark'
    const { container } = render(ThemePicker)

    await fireEvent.keyDown(options(container)[1], { key: 'ArrowLeft' })

    expect(mode.setMode).toHaveBeenCalledWith('light')
  })

  it('вгору і вниз працюють так само', async () => {
    const { container } = render(ThemePicker)

    await fireEvent.keyDown(options(container)[0], { key: 'ArrowDown' })
    expect(mode.setMode).toHaveBeenCalledWith('dark')

    await fireEvent.keyDown(options(container)[1], { key: 'ArrowUp' })
    expect(mode.setMode).toHaveBeenCalledWith('light')
  })

  // Рух по колу — вимога APG: з останнього вправо потрапляєш на перший.
  it('з останнього вправо — на перший', async () => {
    const { container } = render(ThemePicker)

    await fireEvent.keyDown(options(container)[2], { key: 'ArrowRight' })

    expect(mode.setMode).toHaveBeenCalledWith('light')
  })

  it('з першого вліво — на останній', async () => {
    const { container } = render(ThemePicker)

    await fireEvent.keyDown(options(container)[0], { key: 'ArrowLeft' })

    expect(mode.setMode).toHaveBeenCalledWith('system')
  })

  it('Home і End ведуть на краї', async () => {
    const { container } = render(ThemePicker)

    await fireEvent.keyDown(options(container)[1], { key: 'End' })
    expect(mode.setMode).toHaveBeenCalledWith('system')

    await fireEvent.keyDown(options(container)[1], { key: 'Home' })
    expect(mode.setMode).toHaveBeenCalledWith('light')
  })

  it('інші клавіші компонент не перехоплює', async () => {
    const { container } = render(ThemePicker)

    await fireEvent.keyDown(options(container)[0], { key: 'a' })
    await fireEvent.keyDown(options(container)[0], { key: 'Tab' })

    expect(mode.setMode).not.toHaveBeenCalled()
  })
})

describe('клік', () => {
  it('клік по картці змінює тему', async () => {
    const { container } = render(ThemePicker)

    await fireEvent.click(options(container)[1])

    expect(mode.setMode).toHaveBeenCalledWith('dark')
  })

  it('клік по вже обраній нічого не ламає', async () => {
    mode.userPrefersMode.current = 'light'
    const { container } = render(ThemePicker)

    await fireEvent.click(options(container)[0])

    expect(mode.setMode).toHaveBeenCalledWith('light')
  })
})

// ─────────────── Розділи налаштувань ───────────────

describe('розділи налаштувань', () => {
  it('у кожного розділу є slug, підпис, іконка й плитка', () => {
    for (const s of SETTINGS_SECTIONS) {
      expect(s.slug, s.slug).toBeTruthy()
      expect(s.label, s.slug).toBeTruthy()
      expect(s.icon, s.slug).toBeTruthy()
      expect(s.tile, s.slug).toBeTruthy()
    }
  })

  it('slug унікальні — це шматки URL', () => {
    const slugs = SETTINGS_SECTIONS.map((s) => s.slug)

    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('розділ за замовчуванням — справжній розділ, а не вигаданий рядок', () => {
    expect(SETTINGS_SECTIONS.some((s) => s.slug === DEFAULT_SECTION)).toBe(true)
  })

  // Анкета асистента впливає на діалог створення заявки — майстер їх не
  // створює, і розділ йому не потрібен.
  it('«AI асистент» бачить лише клієнт', () => {
    const forClient = sectionsForRole('CLIENT').map((s) => s.slug)
    const forMaster = sectionsForRole('MASTER').map((s) => s.slug)

    expect(forClient).toContain('assistant')
    expect(forMaster).not.toContain('assistant')
  })

  it('розділи без обмежень видно обом ролям', () => {
    const forMaster = sectionsForRole('MASTER').map((s) => s.slug)

    for (const s of SETTINGS_SECTIONS.filter((x) => !x.roles)) {
      expect(forMaster).toContain(s.slug)
    }
  })

  // Роль може не бути прочитана (поза /dashboard локальний кеш порожній).
  it('без ролі показуються тільки спільні розділи', () => {
    const slugs = sectionsForRole(null).map((s) => s.slug)

    expect(slugs).not.toContain('assistant')
    expect(slugs.length).toBeGreaterThan(0)
  })

  it('невідома роль не роняє список', () => {
    expect(() => sectionsForRole('ROBOT')).not.toThrow()
  })
})
