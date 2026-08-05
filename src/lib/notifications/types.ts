// Єдиний тип сповіщення на весь застосунок. Раніше він дублювався
// в user-menu, сайдбарі та слухачі — і встиг розійтись між ними.

/** Рівно те, що вміє створювати `Notify` у server/notifications.ts. */
export const NOTIFICATION_TYPES = [
  'NEW_JOB',
  'NEW_PROPOSAL',
  'PROPOSAL_ACCEPTED',
  'ORDER_STARTED',
  'ORDER_COMPLETED',
  'ORDER_CANCELLED',
  'JOB_REOPENED',
] as const

export type NotificationType =
  | (typeof NOTIFICATION_TYPES)[number]
  | (string & {})

/**
 * Поля адресації (`jobId`, `orderId`…) приходять із Pusher рівно в тому
 * вигляді, у якому лежать у БД — `notify()` шле весь запис цілком.
 * Раніше тут стояв неіснуючий `link`, а сторінка тримала власну копію
 * типу з правильними полями: два описи одних даних, обидва напівживі.
 */
export interface Notification {
  id: string
  type: NotificationType
  title: string
  body?: string | null
  jobId?: string | null
  proposalId?: string | null
  orderId?: string | null
  chatId?: string | null
  isRead: boolean
  createdAt: string
}

/**
 * Куди веде сповіщення. Одна функція на застосунок: коли правило жило
 * у двох компонентах, вони вже встигли розійтись у гілці `chatId`.
 */
export function linkFor(n: Notification): string {
  if (n.orderId) return `/dashboard/orders/${n.orderId}`
  if (n.proposalId) return '/dashboard/proposals'
  if (n.jobId) return `/dashboard/jobs/${n.jobId}`
  if (n.chatId) return `/dashboard/messages/${n.chatId}`
  return '/dashboard/notifications'
}

/** Повідомлення чату рахує chatStore і показує власний бейдж —
 *  у стрічці сповіщень і тостах вони не потрібні. */
export function isChatNotification(n: Notification): boolean {
  return n.type === 'NEW_MESSAGE'
}
