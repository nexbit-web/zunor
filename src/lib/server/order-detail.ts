// Замовлення цілком — для сторінки сайту (dashboard/orders/[id]) і для
// застосунку (GET /api/orders/[id]). Один завантажувач і одна перевірка
// доступу на обох (AGENTS.md, «Перевірка доступу живе в одному місці»):
// коли кожен шлях мав свій запит, API віддавав інше, ніж сторінка (без
// телефону, з чужим 403 замість 404).
//
// Телефон тут — легально: замовлення існує, глядач перевірений як його
// сторона (MANIFESTO, «захист контактів до угоди»). Ніде до угоди його
// немає.

import { prisma } from './prisma'
import { SERVICE_EVENTS } from './order-events'

function query(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          city: true,
          phone: true,
          avgRatingAsClient: true,
          reviewsCountAsClient: true,
        },
      },
      master: {
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          city: true,
          phone: true,
          avgRatingAsMaster: true,
          reviewsCountAsMaster: true,
          masterProfile: {
            select: {
              verificationStatus: true,
              completedOrders: true,
            },
          },
        },
      },
      // «today/tomorrow» у metadata відносні до дня створення ЗАЯВКИ.
      fromJob: { select: { id: true, number: true, createdAt: true } },
      events: {
        // Службова відмітка нагадування (server/reminders) — аудит, не
        // подія для людей: в «Історії подій» їй не місце.
        where: { type: { notIn: [...SERVICE_EVENTS] } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          actorId: true,
          payload: true,
          createdAt: true,
        },
      },
      reviews: {
        select: {
          id: true,
          rating: true,
          comment: true,
          direction: true,
          authorId: true,
          createdAt: true,
        },
      },
    },
  })
}

export type OrderDetailRow = NonNullable<Awaited<ReturnType<typeof query>>>

/**
 * Замовлення для глядача-сторони. Немає такого АБО глядач не клієнт і не
 * майстер — null: назовні це 404, не 403 (чужий обʼєкт не підтверджує
 * навіть свого існування, AGENTS.md 2.2).
 */
export async function loadOrderDetail(
  orderId: string,
  viewerId: string,
): Promise<OrderDetailRow | null> {
  const order = await query(orderId)
  if (!order) return null
  if (order.clientId !== viewerId && order.masterId !== viewerId) return null
  return order
}

/**
 * Відповідь API для застосунку — явний перелік полів (службові поля
 * модерації `removed*` назовні не йдуть), рейтинги плоскі
 * (`avgRating`, `reviewsCount`), як у решті API. Контракт: поля лише
 * додаються.
 */
export function orderDetailDto(order: OrderDetailRow) {
  const { client, master, fromJob } = order
  return {
    id: order.id,
    title: order.title,
    description: order.description,
    metadata: order.metadata,
    priceCents: order.priceCents,
    currency: order.currency,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    startedAt: order.startedAt,
    completedAt: order.completedAt,
    cancelledAt: order.cancelledAt,
    cancelReason: order.cancelReason,
    cancelledById: order.cancelledById,
    clientId: order.clientId,
    masterId: order.masterId,
    chatId: order.chatId,
    jobId: fromJob?.id ?? null,
    jobCreatedAt: fromJob?.createdAt ?? null,
    // Номер заявки для людей (Job.number) — з копії в замовленні: зв'язок
    // fromJob рветься, коли заявку відкривають знову.
    jobNumber: order.jobNumber ?? fromJob?.number ?? null,
    client: {
      id: client.id,
      name: client.name,
      username: client.username,
      avatar: client.avatar,
      city: client.city,
      phone: client.phone ?? null,
      avgRating: client.avgRatingAsClient ?? 0,
      reviewsCount: client.reviewsCountAsClient ?? 0,
    },
    master: {
      id: master.id,
      name: master.name,
      username: master.username,
      avatar: master.avatar,
      city: master.city,
      phone: master.phone ?? null,
      avgRating: master.avgRatingAsMaster ?? 0,
      reviewsCount: master.reviewsCountAsMaster ?? 0,
      isVerified: master.masterProfile?.verificationStatus === 'VERIFIED',
      completedOrders: master.masterProfile?.completedOrders ?? 0,
    },
    reviews: order.reviews,
    events: order.events,
  }
}
