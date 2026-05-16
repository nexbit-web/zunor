// src/params/handle.ts
import type { ParamMatcher } from '@sveltejs/kit'

/**
 * Matcher для роуту /@username.
 * Спрацьовує тільки якщо параметр URL починається з @ і має ≥ 4 символи
 * (мінімум @abc).
 *
 * Використовується у роуті: /[handle=handle]
 *   → /@mihalcann   ✅ matched (handle = '@mihalcann')
 *   → /@a           ❌ занадто короткий
 *   → /dashboard    ❌ не починається з @
 */
export const match: ParamMatcher = (param) => {
  return /^@[a-z][a-z0-9_]{2,19}$/.test(param.toLowerCase())
}
