// * auth.ts підтягуємо ліниво: статичний імпорт тягнув би better-auth у кожен
// * модуль, що зберігає профіль

import { redisEnabled } from './redis'

async function internalAdapter() {
  const { auth } = await import('./auth')
  return (await auth.$context).internalAdapter
}

// * профіль змінено повз better-auth, а сесії в Redis тримають копію
// * користувача. Збій не валить збереження: профіль уже записано
export async function refreshSessionUser(userId: string): Promise<void> {
  if (!redisEnabled) return
  try {
    // * updateUser переписує користувача в усіх його сесіях
    await (
      await internalAdapter()
    ).updateUser(userId, { updatedAt: new Date() })
  } catch (err) {
    console.error('[sessions] refresh user failed:', err)
  }
}

// * саме deleteUserSessions: deleteSessions приймає токени, а не userId
export async function revokeSessions(userId: string): Promise<void> {
  await (await internalAdapter()).deleteUserSessions(userId)
}
