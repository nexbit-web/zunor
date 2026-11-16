// * задача, яку гість написав на головній до реєстрації: параметр в адресі
// * не доживає до кінця реєстрації, localStorage — доживає. Забирає її
// * /dashboard клієнта, один раз

import { browser } from '$app/environment'

const KEY = 'zunor:pending-task'
/** Задача тижневої давності — це вже не «продовжити», а сюрприз. */
const TTL_MS = 24 * 60 * 60 * 1000
/** Стеля: поле на головній — не місце для роману, а сховище спільне. */
export const PENDING_TASK_MAX = 2000

interface Stored {
  text: string
  savedAt: number
}

export function savePendingTask(text: string): void {
  if (!browser) return
  const value = text.trim().slice(0, PENDING_TASK_MAX)
  if (!value) return
  try {
    const stored: Stored = { text: value, savedAt: Date.now() }
    localStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    // * приватний режим чи повне сховище — задачу людина просто набере ще раз
  }
}

/** Повертає збережену задачу й одразу її стирає. */
export function takePendingTask(): string | null {
  if (!browser) return null
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return null
    localStorage.removeItem(KEY)
    const stored = JSON.parse(raw) as Partial<Stored>
    if (typeof stored.text !== 'string' || typeof stored.savedAt !== 'number')
      return null
    if (Date.now() - stored.savedAt > TTL_MS) return null
    const text = stored.text.trim().slice(0, PENDING_TASK_MAX)
    return text || null
  } catch {
    return null
  }
}
