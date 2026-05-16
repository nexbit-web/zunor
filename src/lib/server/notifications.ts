import { prisma } from '$lib/prisma'
import { safeTrigger } from './pusher'
import type { Prisma } from '../../generated/prisma/client'

export type PrismaTx = Omit<Prisma.TransactionClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export async function notify(
  params: {
    userId: string
    type: string
    title: string
    body?: string
    jobId?: string
    proposalId?: string
    orderId?: string
    chatId?: string
  },
  tx: PrismaTx = prisma as unknown as PrismaTx,
): Promise<void> {
  const notification = await tx.notification.create({
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

  await safeTrigger(`private-user-${params.userId}`, 'notification:new', { notification })
}

export const Notify = {
  newJob: (masterId: string, jobId: string, jobTitle: string) =>
    notify({ userId: masterId, type: 'NEW_JOB', title: 'Нова заявка у вашій категорії', body: jobTitle, jobId }),
  newProposal: (clientId: string, jobId: string, proposalId: string) =>
    notify({ userId: clientId, type: 'NEW_PROPOSAL', title: 'Новий відгук на вашу заявку', jobId, proposalId }),
  proposalAccepted: (masterId: string, jobId: string, orderId: string) =>
    notify({ userId: masterId, type: 'PROPOSAL_ACCEPTED', title: 'Клієнт обрав вас!', body: 'Можете розпочинати роботу', jobId, orderId }),
  orderStarted: (clientId: string, orderId: string) =>
    notify({ userId: clientId, type: 'ORDER_STARTED', title: 'Майстер розпочав роботу', orderId }),
  orderCompleted: (clientId: string, orderId: string) =>
    notify({ userId: clientId, type: 'ORDER_COMPLETED', title: 'Замовлення завершено', body: 'Залиште відгук про роботу майстра', orderId }),
  orderCancelled: (recipientId: string, orderId: string, reason?: string) =>
    notify({ userId: recipientId, type: 'ORDER_CANCELLED', title: 'Замовлення скасовано', body: reason, orderId }),
}