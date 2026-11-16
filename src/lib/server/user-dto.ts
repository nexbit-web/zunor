// * рейтинг у User роздвоєний (як майстер / як клієнт), а картки працюють із
// * плоским { avgRating, reviewsCount }. Один select і один мапер: невідомий
// * ключ у вкладеному select Prisma 7 падає лише в рантаймі

/** Кладеться у Prisma-select там, де людину показують ЯК МАЙСТРА. */
export const masterRatingSelect = {
  avgRatingAsMaster: true,
  reviewsCountAsMaster: true,
} as const

/** Кладеться у Prisma-select там, де людину показують ЯК КЛІЄНТА. */
export const clientRatingSelect = {
  avgRatingAsClient: true,
  reviewsCountAsClient: true,
} as const

/** Плоский вигляд рейтингу — контракт для клієнтських компонентів. */
export interface FlatRating {
  avgRating: number
  reviewsCount: number
}

/** *AsMaster → { avgRating, reviewsCount }. Решта полів проходить як є. */
export function flattenMasterRating<
  T extends { avgRatingAsMaster: number; reviewsCountAsMaster: number },
>(user: T): Omit<T, 'avgRatingAsMaster' | 'reviewsCountAsMaster'> & FlatRating {
  const { avgRatingAsMaster, reviewsCountAsMaster, ...rest } = user
  return {
    ...rest,
    avgRating: avgRatingAsMaster,
    reviewsCount: reviewsCountAsMaster,
  }
}

/** *AsClient → { avgRating, reviewsCount }. Решта полів проходить як є. */
export function flattenClientRating<
  T extends { avgRatingAsClient: number; reviewsCountAsClient: number },
>(user: T): Omit<T, 'avgRatingAsClient' | 'reviewsCountAsClient'> & FlatRating {
  const { avgRatingAsClient, reviewsCountAsClient, ...rest } = user
  return {
    ...rest,
    avgRating: avgRatingAsClient,
    reviewsCount: reviewsCountAsClient,
  }
}
