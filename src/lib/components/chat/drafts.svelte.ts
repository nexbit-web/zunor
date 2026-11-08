// Чернетки повідомлень — своя в кожному чаті, як у Telegram.
//
// Раніше поле вводу було одне на всі чати: почав писати майстру, клацнув
// інший чат у списку — і недописане їхало туди. Тепер текст тримається за
// чатом, переживає F5 і видно в списку («Чернетка: …»), тож повернутись
// до недописаного легко.
//
// Лише localStorage, як і незавершений діалог із Zunor
// (zunor/dialog-storage.ts): чернетка — річ одного пристрою, базу будити
// нема чого. Ключ — користувач + чат: двоє людей з одного браузера не
// побачать чернеток одне одного.

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
      // Приватний режим чи битий JSON — просто без чернеток.
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

    // Порядок ключів = порядок запису: свіжа чернетка — в кінець, а
    // найстаріші відрізаються стелею.
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
        // Переповнене сховище — чернетка лишиться до кінця сесії.
      }
    }, SAVE_DELAY_MS)
  }
}

export const chatDrafts = new ChatDrafts()
