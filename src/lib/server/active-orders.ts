// * активні замовлення людини (CREATED / IN_PROGRESS): поки вони є, акаунт не
// * видаляється. Окремий модуль: лоадеру сторінки потрібен лише один COUNT

import { prisma } from './prisma'

export function activeOrdersCount(userId: string): Promise<number> {
  return prisma.order.count({
    where: {
      status: { in: ['CREATED', 'IN_PROGRESS'] },
      OR: [{ clientId: userId }, { masterId: userId }],
    },
  })
}
