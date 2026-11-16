// * чернетки повідомлень — своя в кожному чаті. Лише localStorage: чернетка —
// * річ одного пристрою. Ключ — користувач + чат

import { browser } from '$app/environment'

const STORAGE_KEY = 'zunor-chat-drafts'
/** Стеля: старі чернетки витісняються новими. */
const MAX_DRAFTS = 50
/** Як і саме повідомлення (MAX_TEXT_LENGTH у композері). */
const MAX_LENGTH = 4000
const SAVE_DELAY_MS = 400

const key = (userId: string, chatId: string) => `${userId}:${chatId}`

class ChatDrafts {
  #map = $state<Record<string, string>>({})
  #loaded = false
  #saveTimer: ReturnType<typeof setTimeout> | null = null

  #load(): void {
    if (this.#loaded || !browser) return
    this.#loaded = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : null
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const clean: Record<string, string> = {}
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string' && v.trim()) {
            clean[k] = v.slice(0, MAX_LENGTH)
          }
        }
        this.#map = clean
      }
    } catch {
      // * приватний режим чи битий JSON — просто без чернеток
    }
  }

  get(userId: string, chatId: string): string {
    this.#load()
    return this.#map[key(userId, chatId)] ?? ''
  }

  set(userId: string, chatId: string, text: string): void {
    this.#load()
    const k = key(userId, chatId)
    const value = text.trim() ? text.slice(0, MAX_LENGTH) : ''
    if ((this.#map[k] ?? '') === value) return

    // * порядок ключів = порядок запису: свіжа чернетка — в кінець, а
    // * найстаріші відрізаються стелею
    const { [k]: _, ...rest } = this.#map
    const next = value ? { ...rest, [k]: value } : rest
    const keys = Object.keys(next)
    this.#map =
      keys.length > MAX_DRAFTS
        ? Object.fromEntries(
            keys.slice(-MAX_DRAFTS).map((kk) => [kk, next[kk]]),
          )
        : next
    this.#scheduleSave()
  }

  /** Запис гуртом: на кожну літеру писати в localStorage нема сенсу. */
  #scheduleSave(): void {
    if (!browser) return
    if (this.#saveTimer) clearTimeout(this.#saveTimer)
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = null
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#map))
      } catch {
        // * переповнене сховище — чернетка лишиться до кінця сесії
      }
    }, SAVE_DELAY_MS)
  }
}

export const chatDrafts = new ChatDrafts()
