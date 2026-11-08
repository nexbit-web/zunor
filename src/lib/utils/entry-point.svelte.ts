// «Назад» із розділу, що займає весь екран (налаштування, повідомлення):
// панель дашборда там відʼїжджає, і кнопка має повернути туди, звідки в
// розділ зайшли, — а не на попередній чат чи розділ налаштувань, між
// якими можна ходити скільки завгодно.
//
// Лейаут розділу живе, доки ми в ньому, тож адреса памʼятається з
// першого входу. Відкрили розділ напряму (посилання, F5) — fallback.

import { getContext, setContext } from 'svelte'
import { afterNavigate } from '$app/navigation'

export interface EntryPoint {
  readonly href: string
}

/** Викликати під час ініціалізації лейауту розділу. */
export function entryPoint(prefix: string, fallback = '/dashboard'): EntryPoint {
  let href = $state(fallback)

  afterNavigate(({ from }) => {
    if (!from || from.url.pathname.startsWith(prefix)) return
    href = from.url.pathname + from.url.search + from.url.hash
  })

  return {
    get href() {
      return href
    },
  }
}

const KEY = Symbol('entry-point')

/** Те саме, але доступне вкладеним компонентам через `useEntryPoint`. */
export function provideEntryPoint(prefix: string, fallback?: string): EntryPoint {
  const entry = entryPoint(prefix, fallback)
  setContext(KEY, entry)
  return entry
}

/** undefined — компонент поза таким розділом: кнопки «Назад» не треба. */
export function useEntryPoint(): EntryPoint | undefined {
  return getContext<EntryPoint | undefined>(KEY)
}
