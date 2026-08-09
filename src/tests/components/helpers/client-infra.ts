// Клієнтська інфраструктура для компонентних тестів: Pusher і fetch.
//
// Pusher тут не просто заглушка, а маленька справжня шина: канали
// запам'ятовуються за іменем, обробники — за подією, і тест може
// «надіслати» подію через emit(). Інакше перевірити реакцію стора на
// вхідне повідомлення можна було б хіба що викликом приватного методу.
//
// Один канал на ім'я — це не деталь мока, а поведінка справжнього Pusher,
// на яку спирається код: notifications і chatStore підписані на ОДИН
// private-user-канал і слухають різні події. Саме тому disconnect у
// notifications робить unbind, а не unsubscribe.

import { vi } from 'vitest'

type Handler = (data: unknown) => void

export interface FakeChannel {
  name: string
  bind: ReturnType<typeof vi.fn>
  unbind: ReturnType<typeof vi.fn>
}

const channels = new Map<string, FakeChannel>()
const handlers = new Map<string, Map<string, Set<Handler>>>()

function channelHandlers(name: string): Map<string, Set<Handler>> {
  let map = handlers.get(name)
  if (!map) {
    map = new Map()
    handlers.set(name, map)
  }
  return map
}

function makeChannel(name: string): FakeChannel {
  return {
    name,
    bind: vi.fn((event: string, fn: Handler) => {
      const map = channelHandlers(name)
      if (!map.has(event)) map.set(event, new Set())
      map.get(event)!.add(fn)
    }),
    unbind: vi.fn((event: string, fn?: Handler) => {
      const set = channelHandlers(name).get(event)
      if (!set) return
      if (fn) set.delete(fn)
      else set.clear()
    }),
  }
}

export const pusher = {
  subscribe: vi.fn((name: string) => {
    let ch = channels.get(name)
    if (!ch) {
      ch = makeChannel(name)
      channels.set(name, ch)
    }
    return ch
  }),
  unsubscribe: vi.fn((name: string) => {
    channels.delete(name)
    handlers.delete(name)
  }),
  connection: { bind: vi.fn(), unbind: vi.fn() },
}

export const getPusher = vi.fn(() => pusher)

/** Надіслати подію так, ніби вона прийшла з сервера. */
export function emit(channel: string, event: string, data: unknown): void {
  for (const fn of channelHandlers(channel).get(event) ?? []) fn(data)
}

/** Скільки обробників висить на події — видно подвійні підписки. */
export function handlerCount(channel: string, event: string): number {
  return channelHandlers(channel).get(event)?.size ?? 0
}

export function resetPusher(): void {
  channels.clear()
  handlers.clear()
  pusher.subscribe.mockClear()
  pusher.unsubscribe.mockClear()
  getPusher.mockClear()
}

// ─── fetch ───

export const fetchMock = vi.fn(
  async (_url: string, _init?: RequestInit) =>
    ({ ok: true, json: async () => ({}) }) as unknown as Response,
)

/** Відповідь сервера: 200 з тілом. */
export function respondWith(body: unknown): void {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response)
}

/** Відповідь сервера: помилка зі статусом. */
export function respondFail(status = 500): void {
  fetchMock.mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ message: 'nope' }),
  } as unknown as Response)
}

/** Мережі немає взагалі — найчастіший випадок у мобільному браузері. */
export function respondOffline(): void {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
}

/** Тіло останнього POST розібране з JSON. */
export function lastPostBody(): Record<string, unknown> {
  const call = [...fetchMock.mock.calls]
    .reverse()
    .find((c) => c[1]?.method === 'POST')
  return JSON.parse(String(call?.[1]?.body ?? '{}'))
}

export function installFetch(): void {
  fetchMock.mockReset()
  respondWith({})
  vi.stubGlobal('fetch', fetchMock)
}
