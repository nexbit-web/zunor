// src/lib/server/presence.ts
//
// Оновлення "онлайн"-статусу юзера. Throttle: пишемо в БД не частіше
// разу на 2 хв на юзера, щоб не бити базу на кожен запит.
//
// isOnline визначається опосередковано: lastSeen свіжий = онлайн.
// Тут просто оновлюємо lastSeen + ставимо isOnline=true.

import { prisma } from '$lib/prisma'

const ONLINE_TTL_MS = 2 * 60 * 1000 // оновлюємо не частіше разу на 2 хв
const lastWrite = new Map<string, number>()

export function touchPresence(userId: string): void {
  const now = Date.now()
  const prev = lastWrite.get(userId) ?? 0

  if (now - prev < ONLINE_TTL_MS) return // ще рано, throttle

  lastWrite.set(userId, now)

  // Fail-soft: presence не має ламати запит
  prisma.user
    .update({
      where: { id: userId },
      data: { lastSeen: new Date() },
    })
    .catch(() => {})

  // Прибираємо старі записи з мапи, щоб не росла безкінечно
  if (lastWrite.size > 5000) {
    for (const [id, t] of lastWrite) {
      if (now - t > ONLINE_TTL_MS * 2) lastWrite.delete(id)
    }
  }
}
