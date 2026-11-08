// Активні замовлення людини — ті, де є домовленість, яку ще треба
// виконати (CREATED / IN_PROGRESS), з будь-якого боку. Поки вони є,
// акаунт не видаляється (account-deletion.ts), а сторінка безпеки каже
// про це одразу.
//
// Окремий модуль, а не експорт із account-deletion: той тягне диспетчер,
// Cloudinary й better-auth, а лоадеру сторінки (і його тестам) потрібен
// лише один COUNT.

import { prisma } from './prisma'

export function activeOrdersCount(userId: string): Promise<number> {
  return prisma.order.count({
    where: {
      status: { in: ['CREATED', 'IN_PROGRESS'] },
      OR: [{ clientId: userId }, { masterId: userId }],
    },
  })
}
