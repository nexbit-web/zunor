// Фабрика RequestEvent і хелпери для перевірки відповідей роутів.
//
// Роут у SvelteKit — звичайна функція (event) => Response. Її можна викликати
// напряму, без підняття HTTP-сервера: це дає тести, які виконуються за
// мілісекунди й перевіряють саме логіку роуту.
//
// Помилки роути кидають, а не повертають: error() з @sveltejs/kit кидає
// { status, body: { message } }, redirect() — { status, location }. Звідси
// хелпери failure/redirectOf нижче.

import type { RequestEvent } from '@sveltejs/kit'

/**
 * Кожен роут типізований під СВІЙ маршрут: RequestEvent<RouteParams, '/api/…'>.
 * Одна фабрика на всі роути такому типу відповідати не може, а спеціалізувати
 * її під кожен — це рядок бойлерплейту на кожен тест заради нуля користі.
 * Тому повертаємо навмисно широкий тип: реальну перевірку тут робить не
 * компілятор, а сам прогін тестів.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRequestEvent = any

export interface EventInit {
  /** Тіло запиту. Об'єкт серіалізується в JSON, рядок іде як є. */
  body?: unknown
  /** Тіло як FormData (потрібне, наприклад, для pusher/auth). */
  form?: Record<string, string>
  method?: string
  /** Повний URL або шлях; за замовчуванням https://zunor.test/api/test. */
  url?: string
  params?: Record<string, string>
  headers?: Record<string, string>
  /** locals.user / locals.session / locals.account — те, що вже поклав hooks. */
  locals?: Record<string, unknown>
  /** IP, який поверне getClientAddress(). */
  clientAddress?: string
}

/**
 * Мінімальний користувач у locals.
 *
 * Форма повторює те, що кладе hooks.server.ts: `locals.user` — це
 * `session.user`, тому користувач доступний обома шляхами. Частина
 * лоадерів читає `locals.session.user.id`, частина — `locals.user.id`.
 */
export function sessionUser(id: string): Record<string, unknown> {
  const user = { id, email: `${id}@example.com`, name: id }
  return {
    user,
    session: { id: `sess-${id}`, userId: id, user },
    account: null,
  }
}

/** Гість — сесії немає взагалі. */
export const anonymous: Record<string, unknown> = {
  user: null,
  session: null,
  account: null,
}

export function makeEvent(init: EventInit = {}): AnyRequestEvent {
  const url = new URL(init.url ?? '/api/test', 'https://zunor.test')
  const headers = new Headers(init.headers)

  let request: Request

  if (init.form) {
    const fd = new FormData()
    for (const [k, v] of Object.entries(init.form)) fd.append(k, v)
    request = new Request(url, {
      method: init.method ?? 'POST',
      body: fd,
      headers,
    })
  } else if (init.body !== undefined) {
    headers.set('content-type', 'application/json')
    request = new Request(url, {
      method: init.method ?? 'POST',
      body:
        typeof init.body === 'string' ? init.body : JSON.stringify(init.body),
      headers,
    })
  } else {
    request = new Request(url, { method: init.method ?? 'GET', headers })
  }

  return {
    request,
    url,
    params: init.params ?? {},
    locals: init.locals ?? anonymous,
    getClientAddress: () => init.clientAddress ?? '203.0.113.7',
    setHeaders: () => {},
    cookies: {
      get: () => undefined,
      getAll: () => [],
      set: () => {},
      delete: () => {},
      serialize: () => '',
    },
    fetch: globalThis.fetch,
    platform: undefined,
    route: { id: '/api/test' },
    isDataRequest: false,
    isSubRequest: false,
  } as unknown as RequestEvent
}

export interface Failure {
  status: number
  message: string
}

/**
 * Очікує, що роут ВІДМОВИТЬ, і повертає статус із повідомленням.
 * Якщо роут раптом відпрацював успішно — тест впаде з явним текстом, а не
 * з незрозумілим undefined.
 */
export async function failure(run: () => unknown): Promise<Failure> {
  try {
    const res = await run()
    const status = res instanceof Response ? res.status : 200
    throw new Error(
      `Очікувалась відмова, але роут повернув ${status}. ` +
        'Це означає, що перевірку доступу або валідацію пропущено.',
    )
  } catch (err) {
    const e = err as { status?: number; body?: { message?: string } }
    if (typeof e?.status !== 'number') throw err
    return { status: e.status, message: e.body?.message ?? '' }
  }
}

/** Успішна відповідь: повертає розпарсене тіло. */
export async function okJson<T = Record<string, unknown>>(
  run: () => unknown,
): Promise<T> {
  const res = (await run()) as Response
  if (!(res instanceof Response)) {
    throw new Error('Роут не повернув Response')
  }
  return (await res.json()) as T
}
