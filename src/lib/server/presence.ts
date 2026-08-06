// Оновлення "онлайн"-статусу юзера. Throttle: пишемо в БД не частіше
// разу на 5 хв на юзера, щоб не бити базу на кожен запит.
//
// isOnline визначається опосередковано: lastSeen свіжий = онлайн.
// Тут просто оновлюємо lastSeen + ставимо isOnline=true.
//
// Чому 5, а не 2 хвилини: єдиний споживач lastSeen — scoring диспетчера,
// і там пороги свіжості 5 / 30 / 60 хвилин (див. dispatch/scoring.ts).
// Похибка в кілька хвилин на межі «онлайн» нічого не змінює, а записів
// у таблицю User стає більш ніж удвічі менше.

import { prisma } from './prisma'

const ONLINE_TTL_MS = 5 * 60 * 1000 // оновлюємо не частіше разу на 5 хв
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
