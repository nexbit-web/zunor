// «Ця сесія вже ввела код другого фактора» — у памʼяті процесу.
//
// Ключ — id сесії better-auth, а не користувач: код, введений на
// ноутбуці, не відкриває адмінку на телефоні з тим самим акаунтом.
// Перезапуск процесу все скидає — співробітник просто введе код ще раз,
// і це навіть плюс. Процес один (AGENTS, 2.1), стеля — обовʼязкова.

/** Скільки діє введений код: робочий день, а не тиждень сесії. */
export const STEP_UP_TTL_MS = 12 * 60 * 60_000
const MAX_ENTRIES = 1_000

const verified = new Map<string, number>()

export function markVerified(sessionId: string, now = Date.now()): void {
  verified.delete(sessionId)
  if (verified.size >= MAX_ENTRIES) {
    const oldest = verified.keys().next().value
    if (oldest !== undefined) verified.delete(oldest)
  }
  verified.set(sessionId, now + STEP_UP_TTL_MS)
}

export function isVerified(sessionId: string | undefined, now = Date.now()): boolean {
  if (!sessionId) return false
  const until = verified.get(sessionId)
  if (until === undefined) return false
  if (until < now) {
    verified.delete(sessionId)
    return false
  }
  return true
}

/** Вихід з адмінки, скидання другого фактора — код знову знадобиться. */
export function forgetVerified(sessionId: string): void {
  verified.delete(sessionId)
}

/** Лише для тестів. */
export function clearStepUp(): void {
  verified.clear()
}
