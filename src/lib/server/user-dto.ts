// Рейтинг у User роздвоєний: avgRatingAsMaster / avgRatingAsClient — одна
// людина може бути і замовником, і виконавцем, і репутації в цих ролях різні.
// Картки на клієнті працюють із плоским { avgRating, reviewsCount }: «рейтинг
// у ТІЙ ролі, в якій ти зараз бачиш цю людину».
//
// Один спільний select і один мапер тут, а не по ендпоінтах: у Prisma 7
// невідомий ключ у вкладеному relation-select проходить перевірку типів і
// падає лише в рантаймі, тож `npm run check` такий розсинхрон не спіймає.

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
