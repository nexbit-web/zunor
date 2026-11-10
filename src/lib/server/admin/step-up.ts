// «Ця сесія вже ввела код другого фактора».
//
// Ключ — id сесії better-auth, а не користувач: код, введений на
// ноутбуці, не відкриває адмінку на телефоні з тим самим акаунтом.
//
// Де лежить (AGENTS, 2.1) — рівно в ОДНОМУ місці:
//   — один процес (Hostinger) — у памʼяті. Перезапуск усе скидає —
//     співробітник просто введе код ще раз, і це навіть плюс;
//   — Vercel — лише в Redis. Копій функції кілька: код, введений в одній,
//     інша в памʼяті не бачила б (адмінка питала б його по колу), а
//     «Заблокувати адмінку» в одній не скинуло б копію в памʼяті іншої.
//     Без Redis на Vercel адмінка не відкриється — це навмисно.

import { serverless } from '../runtime'
import { attempt, redisKey } from '../redis'

/** Скільки діє введений код: робочий день, а не тиждень сесії. */
export const STEP_UP_TTL_MS = 12 * 60 * 60_000
const MAX_ENTRIES = 1_000

const verified = new Map<string, number>()

const keyOf = (sessionId: string) => redisKey('stepup', sessionId)

export async function markVerified(
  sessionId: string,
  now = Date.now(),
): Promise<void> {
  const until = now + STEP_UP_TTL_MS
  if (serverless) {
    await attempt((r) =>
      r.set(keyOf(sessionId), String(until), { px: STEP_UP_TTL_MS }),
    )
    return
  }
  verified.delete(sessionId)
  if (verified.size >= MAX_ENTRIES) {
    const oldest = verified.keys().next().value
    if (oldest !== undefined) verified.delete(oldest)
  }
  verified.set(sessionId, until)
}

export async function isVerified(
  sessionId: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!sessionId) return false
  if (serverless) {
    const stored = Number(await attempt((r) => r.get<string>(keyOf(sessionId))))
    return Number.isFinite(stored) && stored >= now
  }
  const until = verified.get(sessionId)
  if (until === undefined) return false
  if (until < now) {
    verified.delete(sessionId)
    return false
  }
  return true
}

/** Вихід з адмінки, скидання другого фактора — код знову знадобиться. */
export async function forgetVerified(sessionId: string): Promise<void> {
  if (serverless) {
    await attempt((r) => r.del(keyOf(sessionId)))
    return
  }
  verified.delete(sessionId)
}

/** Лише для тестів. */
export function clearStepUp(): void {
  verified.clear()
}
