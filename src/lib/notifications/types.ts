// * єдиний тип сповіщення на весь застосунок. Раніше він дублювався
// * в user-menu, сайдбарі та слухачі — і встиг розійтись між ними

/** Рівно те, що вміє створювати `Notify` у server/notifications.ts. */
export const NOTIFICATION_TYPES = [
  'NEW_JOB',
  'NEW_PROPOSAL',
  'PROPOSAL_UPDATED',
  'PROPOSAL_ACCEPTED',
  'ORDER_STARTED',
  'ORDER_COMPLETED',
  'ORDER_CANCELLED',
  'ORDER_REMINDER',
  'JOB_REOPENED',
  'JOB_UPDATED',
  'VERIFICATION_APPROVED',
  'VERIFICATION_REJECTED',
  'REPORT_RESOLVED',
] as const

export type NotificationType =
  | (typeof NOTIFICATION_TYPES)[number]
  | (string & {})

/** Адресні поля (`jobId`, `orderId`…) приходять із Pusher як у базі: `notify()` шле запис цілком. */
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
 * Куди веде сповіщення — одна функція на застосунок. Гілки `proposalId`
 * немає навмисно: відгуки клієнт бачить на сторінці своєї заявки.
 */
export function linkFor(
  // * лише тип і адресні поля: так її кличе й сервер (Telegram), де в
  // * записі з бази createdAt — Date, а не рядок
  n: Pick<Notification, 'type' | 'orderId' | 'jobId' | 'chatId'>,
): string {
  // * рішення модерації — про профіль: там видно позначку чи причину відмови
  if (n.type === 'VERIFICATION_APPROVED' || n.type === 'VERIFICATION_REJECTED') {
    return '/dashboard/profile'
  }
  if (n.orderId) return `/dashboard/orders/${n.orderId}`
  if (n.jobId) return `/dashboard/jobs/${n.jobId}`
  if (n.chatId) return `/dashboard/messages/${n.chatId}`
  return '/dashboard/notifications'
}

/** Повідомлення чату рахує chatStore і показує власний бейдж —
 *  у стрічці сповіщень і тостах вони не потрібні. */
export function isChatNotification(n: Notification): boolean {
  return n.type === 'NEW_MESSAGE'
}
