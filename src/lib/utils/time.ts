// Відносний час — один на весь застосунок.
//
// До цього однакова функція жила в шести місцях: orders/labels.ts,
// components/jobs/display.ts, client-jobs.svelte, master-feed.svelte,
// notification-list.svelte і order-card.svelte. Копії вже встигли
// розійтись: доба назад в одних місцях була «учора», в інших — «1 дн»,
// а в третіх «1 днів тому». Людина бачила три різні відповіді на одне
// питання на сусідніх екранах.
//
// Клієнтське: обидві функції читають поточний час і локаль, тож у SSR і
// в браузері можуть дати різний рядок. Це прийнятно — вони показуються
// в підписах, а не у формі.

/**
 * «щойно», «5 хв тому», «3 год тому», «учора», «3 дн тому», далі — дата.
 *
 * «учора» окремою гілкою навмисно: «1 дн тому» читається як число, а не
 * як день, і око спотикається.
 */
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
