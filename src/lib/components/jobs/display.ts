// Спільні хелпери відображення заявок і пропозицій. Раніше вони були
// продубльовані в job-client-view та job-master-view — тепер єдине джерело.

import { pluralUk } from '$lib/utils/plural'
import { describeJob } from '$lib/categories/cleaning/describe'

type BadgeVariant = 'default' | 'secondary' | 'outline'

export type JobTone = 'action' | 'live' | 'progress' | 'done' | 'off'

/**
 * Стан заявки словами людини, а не статусом із бази. «Відкрита» нічого не
 * каже клієнту: йому важливо, чи шукають ще майстра, чи вже є з кого
 * обирати. Тому відкрита заявка з пропозиціями — окремий стан, і саме він
 * єдиний залитий кольором: це місце, де клієнт має щось зробити.
 *
 * Майстрові кількість чужих пропозицій не показуємо (MANIFESTO,
 * «Справедливий маркетплейс»): «вже 5» відлякувало б новачків, тож для
 * нього відкрита заявка — просто та, що ще приймає пропозиції.
 */
export function jobState(
  job: { status: string; proposalsCount?: number | null },
  viewer: 'client' | 'master' = 'client',
): { label: string; tone: JobTone } {
  switch (job.status) {
    case 'OPEN': {
      if (viewer === 'master')
        return { label: 'Приймає пропозиції', tone: 'live' }
      const n = job.proposalsCount ?? 0
      return n > 0
        ? {
            label: `${n} ${pluralUk(n, 'пропозиція', 'пропозиції', 'пропозицій')}`,
            tone: 'action',
          }
        : { label: 'Шукаємо майстра', tone: 'live' }
    }
    case 'IN_PROGRESS':
      return { label: 'Майстра обрано', tone: 'progress' }
    case 'COMPLETED':
      return { label: 'Завершена', tone: 'done' }
    case 'EXPIRED':
      return { label: 'Термін минув', tone: 'off' }
    default:
      return { label: 'Скасована', tone: 'off' }
  }
}

/**
 * Чому заявка «Топ для тебе» — підписи до причин із мозку підбору
 * (server/dispatch/core/fit.ts). Невідома причина — без підпису, а не
 * сирий ключ у картці.
 */
const FIT_REASONS: Record<string, string> = {
  near: 'Поруч з тобою',
  crew: 'Під твій формат роботи',
  vehicle: 'Є авто для вивозу',
}
export function fitReasonLabels(reasons: readonly string[]): string[] {
  return reasons.map((r) => FIT_REASONS[r]).filter(Boolean)
}

/**
 * Сірі теги картки — значення характеристик (квартира, кімнати, площа),
 * предмети хімчистки — кожен окремо. Без послуги й дня: вони вже в рядку
 * фактів. Одні на картку заявки й картку замовлення.
 */
export function jobTags(metadata: unknown, createdAt: string): string[] {
  return describeJob(metadata, createdAt)
    .filter((d) => d.label !== 'Послуга' && d.label !== 'Коли')
    .flatMap((d) =>
      d.items
        ? d.items.map((i) => (i.qty > 1 ? `${i.name} × ${i.qty}` : i.name))
        : [d.value],
    )
    .filter(Boolean)
}

/** Термін виконання пропозиції: «1 день», «3 дні», «5 днів». */
export function formatDays(n: number): string {
  return `${n} ${pluralUk(n, 'день', 'дні', 'днів')}`
}

export function formatMoney(cents: number, currency = 'UAH'): string {
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(cents / 100)
}

// Відносний час — спільний для всього застосунку, не свій. Реекспорт, щоб
// сторінки заявок не міняли імпорти: сама реалізація в $lib/utils/time.
export { formatRelative } from '$lib/utils/time'

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
