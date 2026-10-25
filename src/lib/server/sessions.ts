// Сесії користувача поза запитами better-auth: оновити кешованого
// користувача після зміни профілю й відкликати всі сесії при бані.
//
// auth.ts підтягується ліниво: статичний імпорт тягнув би better-auth у
// кожен модуль, що зберігає профіль, — і в кожен їхній тест.

import { redisEnabled } from './redis'

async function internalAdapter() {
  const { auth } = await import('./auth')
  return (await auth.$context).internalAdapter
}

/**
 * Профіль змінено повз better-auth (Prisma). Сесії в Redis тримають копію
 * користувача — без оновлення імʼя й аватар у меню лишились би старими до
 * кінця сесії. Збій не валить збереження: профіль уже записано.
 */
export async function refreshSessionUser(userId: string): Promise<void> {
  if (!redisEnabled) return
  try {
    // updateUser сам переписує користувача в усіх його активних сесіях.
    await (
      await internalAdapter()
    ).updateUser(userId, { updatedAt: new Date() })
  } catch (err) {
    console.error('[sessions] refresh user failed:', err)
  }
}

/** Бан: сесії геть і з Redis, і з бази. */
export async function revokeSessions(userId: string): Promise<void> {
  await (await internalAdapter()).deleteSessions(userId)
}
