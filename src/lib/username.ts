// Єдине джерело правди для правил username. Раніше ці правила дублювалися
// у кількох місцях і розійшлися: профіль зберігався, а маршрут
// /@username (src/params/handle.ts) його не приймав → 404.
// Тому regex і список зарезервованих живуть лише тут і імпортуються всюди.

// Має точно збігатися з matcher'ом маршруту src/params/handle.ts:
// починається з літери, далі літери / цифри / _, разом 3–20 символів.
export const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/

// Системні слова, які не можна займати (конфлікт зі шляхами та роллю).
export const RESERVED_USERNAMES = new Set([
  'admin',
  'root',
  'api',
  'support',
  'help',
  'zunor',
  'system',
  'user',
  'users',
  'profile',
  'dashboard',
  'settings',
  'login',
  'register',
  'signup',
  'logout',
  'moderation',
  'verified',
  'null',
  'undefined',
  'anonymous',
])

export type UsernameError = 'format' | 'reserved'

/**
 * Нормалізує (trim + lowercase) і перевіряє username.
 * Повертає очищене значення або причину відмови — щоб клієнт і сервер
 * валідували однаково.
 */
export function validateUsername(
  raw: string,
): { ok: true; value: string } | { ok: false; reason: UsernameError } {
  const value = raw.trim().toLowerCase()
  if (!USERNAME_RE.test(value)) return { ok: false, reason: 'format' }
  if (RESERVED_USERNAMES.has(value)) return { ok: false, reason: 'reserved' }
  return { ok: true, value }
}
