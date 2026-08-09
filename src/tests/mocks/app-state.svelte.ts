// Заглушка для $app/state.
//
// Справжній `page` — рунний обʼєкт, який SvelteKit оновлює при навігації.
// Компоненти читають з нього `page.url.pathname` (підсвітка активного пункту
// меню) і `page.data`. Тут це той самий рунний обʼєкт, тільки крутить його
// тест: setPage('/dashboard/orders') — і сайдбар перемальовується так само,
// як від справжнього переходу.
//
// Файл навмисно .svelte.ts: без компіляції рун `$state` тут не працює, а
// звичайний обʼєкт не викликав би перерахунок `$derived` у компонентах.

interface PageShape {
  url: URL
  params: Record<string, string>
  route: { id: string | null }
  status: number
  error: App.Error | null
  data: Record<string, unknown>
  form: unknown
  state: Record<string, unknown>
}

const DEFAULTS: PageShape = {
  url: new URL('http://localhost/'),
  params: {},
  route: { id: null },
  status: 200,
  error: null,
  data: {},
  form: null,
  state: {},
}

export const page: PageShape = $state({ ...DEFAULTS })

/** Змінити «поточну сторінку». Шлях або повний URL. */
export function setPage(
  url: string,
  extra: Partial<Omit<PageShape, 'url'>> = {},
): void {
  page.url = new URL(url, 'http://localhost')
  Object.assign(page, extra)
}

/** Викликати в beforeEach: сторінка глобальна на весь файл тестів. */
export function resetPage(): void {
  Object.assign(page, DEFAULTS, { url: new URL('http://localhost/') })
}

export const navigating = null
export const updated = { current: false, check: async () => false }
