// Акцентний колір і висока контрастність — персональний вигляд, як і
// тема в mode-watcher. Живуть у localStorage ЦЬОГО браузера: на сервері
// їх немає, тож розділ «Вигляд» рендериться без SSR (див. його +page.ts).
//
// Застосування — атрибутом на <html> (data-accent, data-contrast), а самі
// кольори — у layout.css. До гідратації атрибути ставить скрипт у
// app.html: без нього сторінка спершу малювалась би синьою й перефарбовувалась
// уже після завантаження JS.

/**
 * Порядок — як у палітрі на екрані. Кольорів тут навмисно немає: вони
 * в layout.css (`[data-accent='…']`), і зразок у палітрі бере його звідти
 * ж. Друга копія hex-ів у TS розійшлась би з CSS при першій правці.
 */
export const ACCENTS = [
  { id: 'mono', label: 'Чорно-білий' },
  { id: 'violet', label: 'Фіалковий' },
  { id: 'blue', label: 'Синій' },
  { id: 'pink', label: 'Рожевий' },
  { id: 'purple', label: 'Бузковий' },
  { id: 'indigo', label: 'Волошковий' },
  { id: 'orange', label: 'Помаранчевий' },
  { id: 'teal', label: 'Бірюзовий' },
  { id: 'mocha', label: 'Мокко' },
  { id: 'green', label: 'Зелений' },
] as const

export type AccentId = (typeof ACCENTS)[number]['id']

/** Signal Blue з DESIGN.md — той, що в :root без жодного атрибута. */
export const DEFAULT_ACCENT: AccentId = 'blue'

// Ті самі ключі читає скрипт в app.html — міняти тільки разом.
export const ACCENT_KEY = 'zunor-accent'
export const CONTRAST_KEY = 'zunor-contrast'

export function isAccent(value: unknown): value is AccentId {
  return ACCENTS.some((a) => a.id === value)
}

/** localStorage може кинути (приватний режим, заборонене сховище). */
function persist(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Вибір діє до перезавантаження — це краще, ніж помилка в консолі.
  }
}

class Appearance {
  accent = $state<AccentId>(DEFAULT_ACCENT)
  highContrast = $state(false)

  constructor() {
    if (typeof document === 'undefined') return

    // Стартове значення — з атрибута, який уже поставив app.html, а не
    // повторним читанням сховища: так стор і сторінка гарантовано
    // бачать одне й те саме.
    const root = document.documentElement
    const saved = root.dataset.accent
    if (isAccent(saved)) this.accent = saved
    this.highContrast = root.dataset.contrast === 'more'
  }

  setAccent(id: AccentId): void {
    this.accent = id

    // Типовий колір не пишемо: без атрибута діє :root, і зміна
    // типового в layout.css дійде до всіх, хто його не міняв.
    const custom = id === DEFAULT_ACCENT ? null : id
    persist(ACCENT_KEY, custom)

    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (custom) root.dataset.accent = custom
    else delete root.dataset.accent
  }

  setHighContrast(on: boolean): void {
    this.highContrast = on
    persist(CONTRAST_KEY, on ? 'more' : null)

    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (on) root.dataset.contrast = 'more'
    else delete root.dataset.contrast
  }
}

export const appearance = new Appearance()
