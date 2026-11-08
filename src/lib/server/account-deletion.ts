// Видалення акаунта на прохання самої людини («право бути забутим»,
// обіцяне в /privacy).
//
// Видалення — це ЗНЕОСОБЛЕННЯ, а не DELETE рядка User. На користувача
// посилаються замовлення, повідомлення й відгуки ДРУГОЇ сторони (зовнішні
// ключі без каскаду), і стерти їх означало б забрати в майстра історію
// роботи й рейтинг, а в клієнта — листування про його ж замовлення. Тому
// як у Telegram: рядок лишається під іменем «Видалений акаунт», а все, що
// робить його людиною, стирається.
//
// Що зникає: імʼя, пошта (замінюється на службову — справжня звільняється
// для нової реєстрації), @handle і публічна сторінка, телефон, фото,
// «про себе», анкета асистента, район, способи входу (пароль, Google),
// сесії, сповіщення, коди підтвердження, анкета й портфоліо майстра, фото
// помешкань у заявках. Файли — і з Cloudinary (уся тека zunor/users/<id>/).
//
// Що лишається: завершені й скасовані замовлення, повідомлення в чатах,
// відгуки (рейтинг тих, кого людина оцінювала, не має мінятись), журнал
// розсилки. Фото, надіслані в чат, — теж: вони вже в листуванні з іншою
// людиною, як і в Telegram.
//
// Поки є активне замовлення (CREATED / IN_PROGRESS), видалити не можна:
// друга сторона лишилась би з домовленістю, по яку нікому прийти.

import { prisma } from './prisma'
import { Prisma } from '../../generated/prisma/client'
import { cloudinary } from './cloudinary'
import { cancelWaves } from './dispatch'
import { revokeSessions } from './sessions'
import { invalidateAccount } from './account-cache'
import { activeOrdersCount } from './active-orders'

/** Імʼя, яке бачить друга сторона в чатах, замовленнях і відгуках. */
export const DELETED_NAME = 'Видалений акаунт'

/**
 * Службова пошта замість справжньої: колонка унікальна й обовʼязкова.
 * Домен `.invalid` зарезервований (RFC 2606) — лист туди не піде ніколи.
 */
export function deletedEmail(userId: string): string {
  return `deleted-${userId}@deleted.invalid`
}

export type DeleteResult =
  | { ok: true }
  | { ok: false; reason: 'active-orders'; count: number }
  | { ok: false; reason: 'not-found' }

export async function deleteAccount(userId: string): Promise<DeleteResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })
  if (!user) return { ok: false, reason: 'not-found' }

  const active = await activeOrdersCount(userId)
  if (active > 0) return { ok: false, reason: 'active-orders', count: active }

  const now = new Date()

  // Відкриті заявки — скасувати, як це робить кнопка «Скасувати заявку»
  // (DELETE /api/jobs/[id]): відгуки на них відхилені, хвилі зняті нижче.
  const openJobs = await prisma.job.findMany({
    where: { clientId: userId, status: 'OPEN' },
    select: { id: true },
  })
  const openJobIds = openJobs.map((j) => j.id)

  // Пропозиції майстра, що ще чекають, — відкликати, як «Відкликати»
  // (DELETE /api/proposals/[id]): лічильник заявки мінус один.
  const pending = await prisma.proposal.findMany({
    where: { masterId: userId, status: 'SENT' },
    select: { id: true, jobId: true },
  })

  await prisma.$transaction(async (tx) => {
    if (openJobIds.length > 0) {
      await tx.job.updateMany({
        where: { id: { in: openJobIds } },
        data: { status: 'CANCELLED', closedAt: now },
      })
      await tx.proposal.updateMany({
        where: { jobId: { in: openJobIds }, status: 'SENT' },
        data: { status: 'REJECTED' },
      })
    }

    // Фото помешкань — це дані клієнта. Файли видаляються з хмари нижче,
    // а посилання — тут, інакше на сторінці старого замовлення в майстра
    // висіли б биті картинки.
    await tx.job.updateMany({
      where: { clientId: userId },
      data: { attachments: [], attachmentsPublicIds: [] },
    })

    for (const p of pending) {
      await tx.proposal.update({
        where: { id: p.id },
        data: { status: 'WITHDRAWN', withdrawnAt: now },
      })
      await tx.job.update({
        where: { id: p.jobId },
        data: { proposalsCount: { decrement: 1 } },
      })
    }

    // Анкета майстра: isActive: false прибирає його з розсилки, стрічки й
    // рекомендацій (усі три фільтрують за ним).
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
        isOnline: false,
        // Бан — друга лінія захисту: якщо десь лишилась жива сесія (кеш
        // cookie живе 5 хв), guardHandle викине її на першому ж запиті.
        banned: true,
        banReason: 'account-deleted',
      },
    })

    // Способи входу: без них увійти в цей акаунт неможливо, а справжня
    // пошта вже вільна для нової реєстрації.
    await tx.account.deleteMany({ where: { userId } })
    await tx.notification.deleteMany({ where: { userId } })
    // Коди підтвердження й посилання на скидання пароля, видані на пошту.
    // Коди better-auth лежать як «<тип>-otp-<пошта>»: endsWith із дефісом,
    // а не contains — інакше a@b.co зачепило б і коди xa@b.co. Посилання
    // на скидання пароля — «reset-password:<токен>» зі значенням userId.
    await tx.otpCode.deleteMany({ where: { email: user.email } })
    await tx.verification.deleteMany({
      where: {
        OR: [{ identifier: { endsWith: `-${user.email}` } }, { value: userId }],
      },
    })
  })

  // ─── Після коміту ───

  for (const id of openJobIds) cancelWaves(id)

  // Сесії — і з бази, і з Redis (через better-auth), потім кеш стану
  // акаунта: бан має подіяти на першому ж запиті, а не за TTL.
  await revokeSessions(userId).catch((err) =>
    console.error('[account-deletion] revoke sessions failed:', err),
  )
  await invalidateAccount(userId)

  // Файли — остання й необовʼязкова частина: акаунт уже знеособлено, а
  // збій хмари не має повертати людині «не вдалося видалити». Залишки
  // без жодного посилання в базі ніде не показуються.
  await cloudinary.api
    .delete_resources_by_prefix(`zunor/users/${userId}/`)
    .catch((err: unknown) =>
      console.error('[account-deletion] cloudinary cleanup failed:', err),
    )

  return { ok: true }
}
