import { prisma } from './prisma'
import { safeTrigger } from './pusher'
import { formatDistance } from '$lib/geo/districts'
import type { Notification, Prisma } from '../../generated/prisma/client'

/**
 * «Є нова заявка» для майстра. Лише дані: розсилка записує їх у ТІЙ САМІЙ
 * транзакції, що й журнал покликаних (покликаний без сповіщення
 * неможливий), а подію шле pushNotification уже після коміту.
 */
export function newJobNotice(
  masterId: string,
  jobId: string,
  jobTitle: string,
): Prisma.NotificationCreateManyInput {
  return {
    userId: masterId,
    type: 'NEW_JOB',
    title: 'Є нова заявка для тебе',
    body: jobTitle,
    jobId,
  }
}

/**
 * Пропозиція з-за меж виїзду (останній дзвінок: поруч із заявкою майстрів
 * замало). Не «нова заявка для тебе», а запрошення без зобовʼязань: майстер
 * сам обрав радіус, і ми це визнаємо прямо. Тип той самий — NEW_JOB: веде
 * туди ж, на заявку.
 */
export function jobOfferNotice(
  masterId: string,
  jobId: string,
  jobTitle: string,
  distanceKm: number | null,
): Prisma.NotificationCreateManyInput {
  const far = distanceKm === null ? 'Це' : `Це ${formatDistance(distanceKm)} —`
  return {
    userId: masterId,
    type: 'NEW_JOB',
    title: 'Можливо, тобі буде цікава ця заявка',
    body:
      `${jobTitle}. ${far} далі, ніж ти зазвичай їздиш, але поруч поки ` +
      'немає вільних майстрів. Не підходить — просто пропусти, на рейтинг ' +
      'це не вплине.',
    jobId,
  }
}

/** Подія в особистий канал. Лише для сповіщення, яке вже в базі. */
export function pushNotification(notification: Notification): Promise<void> {
  return safeTrigger(
    `private-user-${notification.userId}`,
    'notification:new',
    { notification },
  )
}

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

  await pushNotification(notification)
}

export const Notify = {
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
