// Календарний час месенджера: сьогодні — година, цього тижня — день
// тижня, далі — дата. Це НЕ «5 хв тому» з $lib/utils/time, а інша
// функція — та, що в Telegram стоїть біля чату в списку й біля знайденого
// повідомлення. Одна на обидва місця, щоб вони не розійшлися.

export function formatChatTime(
  iso: string | null,
  now: Date = new Date(),
): string {
  if (!iso) return ''

  const date = new Date(iso)
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000)
  if (diffMin < 1) return 'щойно'
  if (diffMin < 60) return `${diffMin} хв`

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)

  if (target.getTime() === today.getTime()) {
    return date.toLocaleTimeString('uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (target.getTime() === yesterday.getTime()) return 'вчора'

  const days = (today.getTime() - target.getTime()) / 86_400_000
  if (days < 7) {
    return date
      .toLocaleDateString('uk-UA', { weekday: 'short' })
      .replace('.', '')
  }

  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
}
