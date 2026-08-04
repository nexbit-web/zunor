// Єдиний тип сповіщення на весь застосунок. Раніше він дублювався
// в user-menu, сайдбарі та слухачі — і встиг розійтись між ними.

export const NOTIFICATION_TYPES = [
  'NEW_PROPOSAL',
  'PROPOSAL_ACCEPTED',
  'ORDER_CREATED',
  'ORDER_COMPLETED',
  'ORDER_CANCELLED',
  'NEW_MESSAGE',
] as const

export type NotificationType =
  | (typeof NOTIFICATION_TYPES)[number]
  | (string & {})

export interface Notification {
  id: string
  type: NotificationType
  title: string
  body?: string | null
  link?: string | null
  isRead: boolean
  createdAt: string
}

/** Повідомлення чату рахує chatStore і показує власний бейдж —
 *  у стрічці сповіщень і тостах вони не потрібні. */
export function isChatNotification(n: Notification): boolean {
  return n.type === 'NEW_MESSAGE'
}
