/**
 * Валідація redirectTo проти open-redirect.
 * Приймаємо лише внутрішні шляхи: починається з "/", але не "//" і не "/\"
 * (обидва браузер трактує як protocol-relative URL на чужий домен).
 * Auth-сторінки (/user/*) відкидаємо — інакше redirect-петля login → login.
 */
export function safeRedirectTarget(raw: string | null): string {
  const fallback = '/dashboard'
  if (!raw) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return fallback
  }
  if (raw.startsWith('/user/')) return fallback
  return raw
}
