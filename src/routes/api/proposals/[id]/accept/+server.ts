import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import { Notify } from '$lib/server/notifications'
import { cancelWaves } from '$lib/server/dispatch'
import type { RequestHandler } from './$types'

/**
 * POST /api/proposals/[id]/accept — клиент выбирает мастера.
 *
 * Атомарно:
 *   0. Job → IN_PROGRESS і цей proposal → ACCEPTED умовним записом
 *      (лише з OPEN / SENT): із двох одночасних запитів проходить один,
 *      другий — 409 без другого замовлення
 *   1. Создаёт Order (status=CREATED, БЕЗ чата)
 *   2. Остальные proposals → REJECTED
 *   3. Job.selectedOrderId
 *   4. OrderEvent(CREATED)
 *
 * Чат тут НЕ створюється — інакше кожен вибір майстра плодив би порожній чат
 * у обох списках повідомлень. Його заводить перша спроба написати:
 * POST /api/orders/[id]/chat.
 *
 * После (fail-soft):
 *   - Notification мастеру
 */
export const POST: RequestHandler = async ({ params, locals }) => {
  const user = requireApiUser(locals)

  const proposal = await prisma.proposal.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      jobId: true,
      masterId: true,
      message: true,
      priceCents: true,
      estimatedDays: true,
      status: true,
      job: {
        select: {
          id: true,
          number: true,
          title: true,
          description: true,
          metadata: true,
          clientId: true,
          status: true,
        },
      },
    },
  })

  if (!proposal) throw error(404, 'Proposal не знайдено')

  // Только владелец job может принимать
  if (proposal.job.clientId !== user.id) {
    throw error(403, 'Тільки замовник може обрати майстра')
  }
  if (proposal.job.status !== 'OPEN') {
    throw error(400, 'Заявка вже закрита')
  }
  if (proposal.status !== 'SENT') {
    throw error(400, 'Цей відгук вже неактивний')
  }

  // Атомарная транзакция
  const result = await prisma.$transaction(async (tx) => {
    // 0. Замок. Перевірки вище зроблені ДО транзакції, тож два запити
    //    одночасно (подвійний клік, дві вкладки, скрипт) обидва бачили
    //    заявку відкритою — і створювали ДВА замовлення на одну заявку.
    //    Умовний запис пускає рівно один: другий чекає на перший і бачить
    //    уже закриту заявку (0 рядків) — усе відкочується.
    const claimed = await tx.job.updateMany({
      where: { id: proposal.jobId, status: 'OPEN' },
      data: { status: 'IN_PROGRESS', closedAt: new Date() },
    })
    if (claimed.count !== 1) throw error(409, 'Заявка вже закрита')

    // Відгук — так само: майстер міг щойно відкликати його або змінити
    // ціну (PATCH /api/proposals/[id]). Замовлення створюється рівно за
    // тією ціною, яку бачив клієнт, або не створюється зовсім.
    const accepted = await tx.proposal.updateMany({
      where: {
        id: proposal.id,
        status: 'SENT',
        priceCents: proposal.priceCents,
      },
      data: { status: 'ACCEPTED' },
    })
    if (accepted.count !== 1) {
      throw error(409, 'Пропозиція щойно змінилась — оновіть сторінку')
    }

    // 1. Создаём Order. chatId лишається null — чат заведе перший, хто
    //    натисне «Написати» (POST /api/orders/[id]/chat).
    const order = await tx.order.create({
      data: {
        clientId: user.id,
        masterId: proposal.masterId,
        title: proposal.job.title,
        description: proposal.job.description ?? '',
        metadata: proposal.job.metadata ?? undefined,
        priceCents: proposal.priceCents,
        currency: 'UAH',
        status: 'CREATED',
        // Номер заявки — копією: лишається й після того, як заявка
        // відкриється знову (schema.prisma, Order.jobNumber).
        jobNumber: proposal.job.number,
      },
      select: {
        id: true,
        title: true,
        priceCents: true,
        currency: true,
        status: true,
        chatId: true,
        clientId: true,
        masterId: true,
      },
    })

    // 4. Остальные → REJECTED
    await tx.proposal.updateMany({
      where: {
        jobId: proposal.jobId,
        id: { not: proposal.id },
        status: 'SENT',
      },
      data: { status: 'REJECTED' },
    })

    // 5. Заявка (вже IN_PROGRESS — крок 0) посилається на замовлення
    await tx.job.update({
      where: { id: proposal.jobId },
      data: { selectedOrderId: order.id },
    })

    // 6. Audit
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'CREATED',
        actorId: user.id,
        payload: {
          jobId: proposal.jobId,
          proposalId: proposal.id,
        } as any,
      },
    })

    return order
  })

  // Майстра обрано, заявка більше не приймає відгуки — знімаємо заплановані
  // хвилі, щоб таймер не будив базу заради закритої заявки.
  cancelWaves(proposal.jobId)

  // Notification мастеру (fail-soft)
  try {
    await Notify.proposalAccepted(proposal.masterId, proposal.jobId, result.id)
  } catch (err) {
    console.error('[proposal:accept] notify failed', err)
  }

  return json({ order: result }, { status: 201 })
}
