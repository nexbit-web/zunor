import { prisma } from '../../prisma'

/** Глобальний клієнт або транзакція під локом — для читань однаково. */
export type Db = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

export { prisma }
