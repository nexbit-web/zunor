import type { OrderStatus, ProposalStatus, JobStatus } from '../../generated/prisma/client'

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  CREATED: 'Створено',
  IN_PROGRESS: 'В роботі',
  COMPLETED: 'Завершено',
  CANCELLED: 'Скасовано',
}

export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  CREATED: 'amber',
  IN_PROGRESS: 'blue',
  COMPLETED: 'green',
  CANCELLED: 'gray',
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; color: string }> = {
  CREATED: { label: 'Створено', color: 'amber' },
  IN_PROGRESS: { label: 'В роботі', color: 'blue' },
  COMPLETED: { label: 'Завершено', color: 'green' },
  CANCELLED: { label: 'Скасовано', color: 'gray' },
}

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  SENT: 'Надіслано',
  ACCEPTED: 'Прийнято',
  REJECTED: 'Відхилено',
  WITHDRAWN: 'Відкликано',
}

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  OPEN: 'Відкрита',
  IN_PROGRESS: 'В роботі',
  COMPLETED: 'Завершена',
  CANCELLED: 'Скасована',
  EXPIRED: 'Прострочена',
}

export function formatPrice(cents: number, currency = 'UAH'): string {
  const uah = cents / 100
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(uah)
}

export const formatMoney = formatPrice

export function formatBudget(
  minCents: number | null,
  maxCents: number | null,
  currency = 'UAH',
): string {
  if (minCents == null && maxCents == null) return 'Бюджет договірний'
  if (minCents != null && maxCents != null) {
    return `${formatPrice(minCents, currency)} – ${formatPrice(maxCents, currency)}`
  }
  if (minCents != null) return `від ${formatPrice(minCents, currency)}`
  if (maxCents != null) return `до ${formatPrice(maxCents, currency)}`
  return 'Бюджет договірний'
}

export function formatRelative(iso: string | Date): string {
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHr / 24)
  if (diffMin < 1) return 'щойно'
  if (diffMin < 60) return `${diffMin} хв тому`
  if (diffHr < 24) return `${diffHr} год тому`
  if (diffDays < 7) return `${diffDays} днів тому`
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
}