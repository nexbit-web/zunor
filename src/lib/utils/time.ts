// * відносний час — один на застосунок. Читає поточний час і локаль, тож у
// * SSR і в браузері рядок може різнитись: це підписи, а не дані форми

/** «щойно», «5 хв тому», «3 год тому», «учора», «3 дн тому», далі — дата. */
export function formatRelative(value: string | Date): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const min = Math.floor((Date.now() - date.getTime()) / 60_000)
  const hr = Math.floor(min / 60)
  const days = Math.floor(hr / 24)

  if (min < 1) return 'щойно'
  if (min < 60) return `${min} хв тому`
  if (hr < 24) return `${hr} год тому`
  if (days === 1) return 'учора'
  if (days < 7) return `${days} дн тому`

  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })
}

/** Календарний день за Києвом: «Сьогодні», «Завтра», «Учора», далі «Пт, 30 жовт.». */
export function formatDay(iso: string, now: Date = new Date()): string {
  const day = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(day)) return ''

  const today = Date.parse(
    `${now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' })}T00:00:00Z`,
  )
  const diff = Math.round((day - today) / 86_400_000)
  if (diff === 0) return 'Сьогодні'
  if (diff === 1) return 'Завтра'
  if (diff === -1) return 'Учора'

  // * timeZone UTC: день уже календарний, зсув пояса переніс би його
  const label = new Date(day).toLocaleDateString('uk-UA', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Точна дата з часом — для `title`, де відносний час недостатній. */
export function formatFull(value: string | Date): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleString('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
