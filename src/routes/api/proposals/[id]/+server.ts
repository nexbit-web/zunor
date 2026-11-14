import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import { masterRatingSelect, flattenMasterRating } from '$lib/server/user-dto'
import { limit } from '$lib/server/rate-limit'
import { Notify } from '$lib/server/notifications'
import type { RequestHandler } from './$types'

/**
 * GET /api/proposals/[id]
 * Доступ — тільки майстер-автор або власник job.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireApiUser(locals)

  const proposal = await prisma.proposal.findUnique({
    where: { id: params.id },
    include: {
      master: {
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          city: true,
          ...masterRatingSelect,
          masterProfile: {
            select: {
              verificationStatus: true,
              completedOrders: true,
            },
          },
        },
      },
      job: {
        select: {
          id: true,
          title: true,
          clientId: true,
          status: true,
        },
      },
    },
  })

  if (!proposal) throw error(404, 'Не знайдено')

  const userId = user.id
  if (userId !== proposal.masterId && userId !== proposal.job.clientId) {
    throw error(403, 'Доступ заборонено')
  }

  return json({
    proposal: { ...proposal, master: flattenMasterRating(proposal.master) },
  })
}

/** «1 500 ₴» — для тексту сповіщення. */
function uah(cents: number): string {
  return `${(cents / 100).toLocaleString('uk-UA')} ₴`
}

/**
 * PATCH /api/proposals/[id] — майстер змінює ціну у своєму відгуку.
 * Body: { priceUah: number }
 *
 * Навіщо (власник): клієнт бачить телефон майстра просто в пропозиції й
 * дзвонить домовитись; домовились про іншу ціну — майстер оновлює її тут,
 * і клієнт обирає вже за новою (accept копіює priceCents у замовлення).
 *
 * Лише поки відгук живий (SENT), а заявка відкрита: після вибору ціна —
 * умова замовлення, і одна сторона її не міняє. Межі — ті самі, що в
 * POST /api/jobs/[id]/proposals.
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const user = requireApiUser(locals)

  const rl = await limit(`proposal-edit:${user.id}`, {
    points: 30,
    duration: 60 * 60_000,
  })
  if (!rl.success) throw error(429, 'Забагато змін ціни')

  const body = await request.json().catch(() => null)
  if (!body) throw error(400, 'Invalid JSON')

  const priceUah = Number(body.priceUah)
  if (!Number.isFinite(priceUah) || priceUah <= 0)
    throw error(400, 'Вкажіть ціну')
  if (priceUah < 50 || priceUah > 500_000)
    throw error(400, 'Ціна: 50-500 000 грн')
  const priceCents = Math.round(priceUah * 100)

  const proposal = await prisma.proposal.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      masterId: true,
      jobId: true,
      status: true,
      priceCents: true,
      job: { select: { status: true, clientId: true } },
      master: { select: { name: true } },
    },
  })

  if (!proposal) throw error(404, 'Не знайдено')
  if (proposal.masterId !== user.id) throw error(403, 'Не ваш відгук')
  if (proposal.status !== 'SENT' || proposal.job.status !== 'OPEN') {
    throw error(400, 'Ціну можна змінити, лише поки вас не обрали')
  }

  // Та сама ціна — нічого не пишемо й не турбуємо клієнта сповіщенням.
  if (proposal.priceCents === priceCents) {
    return json({ proposal: { id: proposal.id, priceCents } })
  }

  // Умовний запис: між читанням і записом клієнт міг уже обрати майстра
  // (accept). Тоді ціна лишається тією, за якою його обрали.
  const { count } = await prisma.proposal.updateMany({
    where: { id: proposal.id, status: 'SENT', job: { status: 'OPEN' } },
    data: { priceCents },
  })
  if (count === 0) {
    throw error(409, 'Клієнт уже обрав майстра — ціну змінити не можна')
  }

  // Після запису, не в транзакції — як і решта сповіщень (notify).
  await Notify.proposalPriceChanged(
    proposal.job.clientId,
    proposal.jobId,
    proposal.id,
    proposal.master.name,
    uah(proposal.priceCents),
    uah(priceCents),
  ).catch(() => {})

  return json({ proposal: { id: proposal.id, priceCents } })
}

/**
 * DELETE /api/proposals/[id] — майстер відкликає свій відгук.
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = requireApiUser(locals)

  const proposal = await prisma.proposal.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      masterId: true,
      jobId: true,
      status: true,
    },
  })

  if (!proposal) throw error(404, 'Не знайдено')
  if (proposal.masterId !== user.id) {
    throw error(403, 'Не ваш відгук')
  }
  if (proposal.status !== 'SENT') {
    throw error(400, 'Можна відкликати тільки активний відгук')
  }

  await prisma.$transaction(async (tx) => {
    await tx.proposal.update({
      where: { id: proposal.id },
      data: {
        status: 'WITHDRAWN',
        withdrawnAt: new Date(),
      },
    })

    await tx.job.update({
      where: { id: proposal.jobId },
      data: { proposalsCount: { decrement: 1 } },
    })
  })

  return json({ ok: true })
}
