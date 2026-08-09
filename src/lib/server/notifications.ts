import { prisma } from './prisma'
import { safeTrigger } from './pusher'

/**
 * Створює сповіщення й одразу шле подію в особистий канал користувача.
 *
 * Транзакційного клієнта функція НЕ приймає навмисно. Подія летить відразу
 * після create, і всередині транзакції це означало б broadcast до коміту:
 * відкотилась — а у вкладці вже спалахнуло сповіщення про замовлення, якого
 * в базі немає. Тому кличемо тільки ПІСЛЯ успішного коміту, як зроблено в
 * `api/proposals/[id]/accept`.
 */
export async function notify(params: {
  userId: string
  type: string
  title: string
  body?: string
  jobId?: string
  proposalId?: string
  orderId?: string
  chatId?: string
}): Promise<void> {
  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      jobId: params.jobId,
      proposalId: params.proposalId,
      orderId: params.orderId,
      chatId: params.chatId,
    },
  })

  await safeTrigger(`private-user-${params.userId}`, 'notification:new', {
    notification,
  })
}

export const Notify = {
  newJob: (masterId: string, jobId: string, jobTitle: string) =>
    notify({
      userId: masterId,
      type: 'NEW_JOB',
      title: 'Є нова заявка для тебе',
      body: jobTitle,
      jobId,
    }),
  newProposal: (clientId: string, jobId: string, proposalId: string) =>
    notify({
      userId: clientId,
      type: 'NEW_PROPOSAL',
      title: 'Майстер відгукнувся на твою заявку!',
      jobId,
      proposalId,
    }),
  proposalAccepted: (masterId: string, jobId: string, orderId: string) =>
    notify({
      userId: masterId,
      type: 'PROPOSAL_ACCEPTED',
      title: 'Вітаю, тебе обрали!',
      body: 'Можеш починати роботу',
      jobId,
      orderId,
    }),
  orderStarted: (clientId: string, orderId: string) =>
    notify({
      userId: clientId,
      type: 'ORDER_STARTED',
      title: 'Майстер узявся за роботу',
      orderId,
    }),
  orderCompleted: (clientId: string, orderId: string) =>
    notify({
      userId: clientId,
      type: 'ORDER_COMPLETED',
      title: 'Роботу завершено!',
      body: 'Залиш відгук про майстра',
      orderId,
    }),
  orderCancelled: (recipientId: string, orderId: string, reason?: string) =>
    notify({
      userId: recipientId,
      type: 'ORDER_CANCELLED',
      title: 'Замовлення скасовано',
      body: reason,
      orderId,
    }),

  jobReopened: (clientId: string, jobId: string) =>
    notify({
      userId: clientId,
      type: 'JOB_REOPENED',
      title: 'Майстер відмовився, але я вже шукаю нового.',
      body: 'Скоро зʼявляться нові відгуки — я повідомлю.',
      jobId,
    }),
}
