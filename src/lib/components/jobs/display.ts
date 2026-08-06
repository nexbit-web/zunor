// Спільні хелпери відображення заявок і пропозицій. Раніше вони були
// продубльовані в job-client-view та job-master-view — тепер єдине джерело.

type BadgeVariant = 'default' | 'secondary' | 'outline'

export function formatMoney(cents: number, currency = 'UAH'): string {
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(cents / 100)
}

/** Відносний час: «щойно», «5 хв тому», «3 дн», або дата. */
export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  const hr = Math.floor(min / 60)
  const days = Math.floor(hr / 24)
  if (min < 1) return 'щойно'
  if (min < 60) return `${min} хв тому`
  if (hr < 24) return `${hr} год тому`
  if (days < 7) return `${days} дн`
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'short',
  })
}

/** Скільки лишилось до закінчення заявки. */
export function expiresIn(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'Прострочено'
  const days = Math.floor(diff / (24 * 60 * 60_000))
  const hr = Math.floor(diff / (60 * 60_000))
  if (days >= 1) return `${days} дн`
  if (hr >= 1) return `${hr} год`
  return '< 1 год'
}

export function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', {
    month: 'short',
    year: 'numeric',
  })
}

export function initials(name: string | null): string {
  return (name ?? '?')[0]?.toUpperCase() ?? '?'
}

export function statusVariant(s: string): BadgeVariant {
  if (s === 'OPEN') return 'default'
  if (s === 'IN_PROGRESS') return 'secondary'
  return 'outline'
}

const JOB_STATUS: Record<string, string> = {
  OPEN: 'Відкрита',
  IN_PROGRESS: 'У роботі',
  COMPLETED: 'Завершена',
  CANCELLED: 'Скасована',
  EXPIRED: 'Прострочена',
}
export function statusLabel(s: string): string {
  return JOB_STATUS[s] ?? s
}

const PROPOSAL_STATUS: Record<string, string> = {
  SENT: 'Очікує',
  ACCEPTED: 'Прийнято',
  REJECTED: 'Відхилено',
  WITHDRAWN: 'Відкликано',
}
export function proposalStatusLabel(s: string): string {
  return PROPOSAL_STATUS[s] ?? s
}

export function proposalStatusVariant(s: string): BadgeVariant {
  if (s === 'ACCEPTED') return 'default'
  if (s === 'SENT') return 'secondary'
  return 'outline'
}
