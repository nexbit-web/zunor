// * замовлення цілком — один завантажувач і одна перевірка доступу для сайту
// * й застосунку. Телефон тут законний: угода є, глядач — її сторона

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
      // * «today/tomorrow» у metadata відносні до дня створення заявки
      fromJob: { select: { id: true, number: true, createdAt: true } },
      events: {
        // * службова відмітка нагадування — аудит, не подія для людей
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

/** Замовлення для його сторони; немає або глядач не сторона — null (назовні 404). */
export async function loadOrderDetail(
  orderId: string,
  viewerId: string,
): Promise<OrderDetailRow | null> {
  const order = await query(orderId)
  if (!order) return null
  if (order.clientId !== viewerId && order.masterId !== viewerId) return null
  return order
}

// * відповідь API — явний перелік полів: службові `removed*` назовні не йдуть.
// * Контракт: поля лише додаються
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
    // * номер — з копії в замовленні: звʼязок fromJob рветься, коли заявку відкривають знову
    jobNumber: order.jobNumber ?? fromJob?.number ?? null,
    client: {
      id: client.id,
      name: client.name,
      avatar: client.avatar,
      city: client.city,
      phone: client.phone ?? null,
      avgRating: client.avgRatingAsClient ?? 0,
      reviewsCount: client.reviewsCountAsClient ?? 0,
    },
    master: {
      id: master.id,
      name: master.name,
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
