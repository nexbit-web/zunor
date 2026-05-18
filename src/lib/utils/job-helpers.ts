// src/lib/utils/job-helpers.ts
export function formatMoney(cents: number, currency = 'UAH') {
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(cents / 100)
}

export function formatBudget(
  min: number | null,
  max: number | null,
  currency = 'UAH',
) {
  if (min && max)
    return `${formatMoney(min, currency)} — ${formatMoney(max, currency)}`
  if (max) return `до ${formatMoney(max, currency)}`
  if (min) return `від ${formatMoney(min, currency)}`
  return 'Бюджет договірний'
}

export function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  const hr = Math.floor(min / 60)
  const days = Math.floor(hr / 24)
  if (min < 1) return 'щойно'
  if (min < 60) return `${min} хв тому`
  if (hr < 24) return `${hr} год тому`
  if (days < 7) return `${days} дн тому`
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'short',
  })
}

export function expiresIn(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'Прострочено'
  const days = Math.floor(diff / (24 * 60 * 60_000))
  const hr = Math.floor(diff / (60 * 60_000))
  if (days >= 1) return `Активна ще ${days} дн`
  if (hr >= 1) return `Активна ще ${hr} год`
  return 'Активна < 1 год'
}

export function memberSince(iso: string) {
  return new Date(iso).toLocaleDateString('uk-UA', {
    month: 'short',
    year: 'numeric',
  })
}

export function initials(name: string | null) {
  return (name ?? '?')[0]?.toUpperCase() ?? '?'
}

export function statusLabel(s: string) {
  return (
    (
      {
        OPEN: 'Відкрита',
        IN_PROGRESS: 'У роботі',
        COMPLETED: 'Завершена',
        CANCELLED: 'Скасована',
        EXPIRED: 'Прострочена',
      } as Record<string, string>
    )[s] ?? s
  )
}

export function proposalStatusLabel(s: string) {
  return (
    (
      {
        SENT: 'Очікує',
        ACCEPTED: 'Прийнято',
        REJECTED: 'Відхилено',
        WITHDRAWN: 'Відкликано',
      } as Record<string, string>
    )[s] ?? s
  )
}
