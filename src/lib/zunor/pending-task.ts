// Задача, яку гість написав у поле на головній ДО реєстрації.
//
// Як у Lovable: людина вже сформулювала, що треба прибрати, і втрачати це
// через реєстрацію не можна. Між головною й чатом лежать реєстрація,
// підтвердження пошти й онбординг (а з Google — ще й чужий домен), тож
// параметр в адресі через усе це не доживає. localStorage доживає.
//
// Забирає задачу `/dashboard` клієнта (усі шляхи входу закінчуються там) і
// відкриває з нею `/dashboard/jobs/new?q=…` — далі як із будь-яким ?q=.
// Забирає один раз: повторний вхід на `/dashboard` уже нікуди не кидає.

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
    // Приватний режим чи повне сховище — задачу людина просто набере ще раз.
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
