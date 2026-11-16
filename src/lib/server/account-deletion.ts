// * видалення акаунта — знеособлення, а не DELETE рядка: на користувача
// * посилаються замовлення, повідомлення й відгуки другої сторони. Рядок
// * лишається як «Видалений акаунт», усе особисте стирається разом із файлами.
// * З активним замовленням видалити не можна

import { prisma } from './prisma'
import { Prisma } from '../../generated/prisma/client'
import { cloudinary } from './cloudinary'
import { cancelWaves } from './dispatch'
import { revokeSessions } from './sessions'
import { invalidateAccount } from './account-cache'
import { activeOrdersCount } from './active-orders'
import { forgetChatId } from './telegram/chat-cache'

/** Імʼя, яке бачить друга сторона в чатах, замовленнях і відгуках. */
export const DELETED_NAME = 'Видалений акаунт'

/** Службова пошта: колонка унікальна й обовʼязкова; `.invalid` зарезервований — лист не піде. */
export function deletedEmail(userId: string): string {
  return `deleted-${userId}@deleted.invalid`
}

export type DeleteResult =
  | { ok: true }
  | { ok: false; reason: 'active-orders'; count: number }
  | { ok: false; reason: 'not-found' }

/** Відкрита робота людини: її заявки, що шукають майстра, і її пропозиції, що чекають. */
export interface OpenWork {
  openJobIds: string[]
  pending: { id: string; jobId: string }[]
}

export async function openWorkOf(userId: string): Promise<OpenWork> {
  const [jobs, pending] = await Promise.all([
    prisma.job.findMany({
      where: { clientId: userId, status: 'OPEN' },
      select: { id: true },
    }),
    prisma.proposal.findMany({
      where: { masterId: userId, status: 'SENT' },
      select: { id: true, jobId: true },
    }),
  ])
  return { openJobIds: jobs.map((j) => j.id), pending }
}

// * закриває відкриту роботу людини, якої більше не буде (видалення, бан):
// * заявки скасовуються, пропозиції відкликаються. Хвилі знімає
// * afterOpenWorkClosed — уже після коміту
export async function closeOpenWork(
  tx: Prisma.TransactionClient,
  work: OpenWork,
  now: Date,
): Promise<void> {
  if (work.openJobIds.length > 0) {
    await tx.job.updateMany({
      where: { id: { in: work.openJobIds } },
      data: { status: 'CANCELLED', closedAt: now },
    })
    await tx.proposal.updateMany({
      where: { jobId: { in: work.openJobIds }, status: 'SENT' },
      data: { status: 'REJECTED' },
    })
  }

  for (const p of work.pending) {
    await tx.proposal.update({
      where: { id: p.id },
      data: { status: 'WITHDRAWN', withdrawnAt: now },
    })
    await tx.job.update({
      where: { id: p.jobId },
      data: { proposalsCount: { decrement: 1 } },
    })
  }
}

/** Після коміту: заявок більше немає — їхні хвилі не мають будити майстрів. */
export function afterOpenWorkClosed(work: OpenWork): void {
  for (const id of work.openJobIds) cancelWaves(id)
}

export async function deleteAccount(userId: string): Promise<DeleteResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })
  if (!user) return { ok: false, reason: 'not-found' }

  const active = await activeOrdersCount(userId)
  if (active > 0) return { ok: false, reason: 'active-orders', count: active }

  const now = new Date()

  const work = await openWorkOf(userId)

  await prisma.$transaction(async (tx) => {
    await closeOpenWork(tx, work, now)

    // * фото помешкань — дані клієнта: посилання геть, файли стираються нижче
    await tx.job.updateMany({
      where: { clientId: userId },
      data: { attachments: [], attachmentsPublicIds: [] },
    })

    // * isActive: false прибирає з розсилки, стрічки й рекомендацій
    await tx.masterProfile.updateMany({
      where: { userId },
      data: {
        isActive: false,
        description: null,
        metadata: Prisma.DbNull,
        portfolioImages: [],
        portfolioImagesPublicIds: [],
      },
    })

    await tx.user.update({
      where: { id: userId },
      data: {
        name: DELETED_NAME,
        email: deletedEmail(userId),
        emailVerified: false,
        username: null,
        phone: null,
        avatar: null,
        avatarPublicId: null,
        bio: null,
        aiProfile: Prisma.DbNull,
        city: null,
        district: null,
        telegramChatId: null,
        telegramLinkedAt: null,
        isOnline: false,
        // * бан — друга лінія: живу сесію з cookie-кешу викине guardHandle
        banned: true,
        banReason: 'account-deleted',
      },
    })

    // * без способів входу в акаунт не зайти, а справжня пошта вже вільна
    await tx.account.deleteMany({ where: { userId } })
    await tx.notification.deleteMany({ where: { userId } })
    await tx.pushToken.deleteMany({ where: { userId } })
    // * коди better-auth лежать як «<тип>-otp-<пошта>»: endsWith із дефісом, а не
    // * contains — інакше a@b.co зачепило б і xa@b.co
    await tx.otpCode.deleteMany({ where: { email: user.email } })
    await tx.verification.deleteMany({
      where: {
        OR: [{ identifier: { endsWith: `-${user.email}` } }, { value: userId }],
      },
    })
  })

  afterOpenWorkClosed(work)

  // * сесії й кеш стану акаунта: бан діє на першому ж запиті
  await revokeSessions(userId).catch((err) =>
    console.error('[account-deletion] revoke sessions failed:', err),
  )
  await invalidateAccount(userId)
  forgetChatId(userId)

  // * файли — остання й необовʼязкова частина: збій хмари не скасовує видалення
  await cloudinary.api
    .delete_resources_by_prefix(`zunor/users/${userId}/`)
    .catch((err: unknown) =>
      console.error('[account-deletion] cloudinary cleanup failed:', err),
    )

  return { ok: true }
}
