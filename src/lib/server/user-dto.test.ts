import { describe, it, expect } from 'vitest'
import { flattenMasterRating, flattenClientRating } from './user-dto'

// Регресійний тест на баг, через який шість API-роутів просили в Prisma
// поле avgRating, якого в схемі вже не було. Типи такого не ловлять
// (у Prisma 7 зайвий ключ у вкладеному relation-select проходить перевірку),
// тому тримаємо мапінг тут і покриваємо його.

describe('flattenMasterRating', () => {
  it('перекладає *AsMaster у плоский контракт', () => {
    const out = flattenMasterRating({
      id: 'm1',
      name: 'Оля',
      avgRatingAsMaster: 4.8,
      reviewsCountAsMaster: 12,
    })

    expect(out.avgRating).toBe(4.8)
    expect(out.reviewsCount).toBe(12)
  })

  it('прибирає вихідні ключі — назовні тече лише DTO', () => {
    const out = flattenMasterRating({
      id: 'm1',
      avgRatingAsMaster: 4.8,
      reviewsCountAsMaster: 12,
    })

    expect(out).not.toHaveProperty('avgRatingAsMaster')
    expect(out).not.toHaveProperty('reviewsCountAsMaster')
  })

  it('решту полів не чіпає, включно з вкладеними', () => {
    const profile = { verificationStatus: 'VERIFIED', completedOrders: 7 }
    const out = flattenMasterRating({
      id: 'm1',
      name: 'Оля',
      city: 'odesa',
      masterProfile: profile,
      avgRatingAsMaster: 0,
      reviewsCountAsMaster: 0,
    })

    expect(out.id).toBe('m1')
    expect(out.city).toBe('odesa')
    expect(out.masterProfile).toBe(profile)
  })

  it('нулі проходять як нулі, а не як undefined', () => {
    const out = flattenMasterRating({
      avgRatingAsMaster: 0,
      reviewsCountAsMaster: 0,
    })
    expect(out.avgRating).toBe(0)
    expect(out.reviewsCount).toBe(0)
  })
})

describe('flattenClientRating', () => {
  it('бере саме клієнтський рейтинг', () => {
    const out = flattenClientRating({
      id: 'c1',
      avgRatingAsClient: 4.2,
      reviewsCountAsClient: 3,
    })

    expect(out.avgRating).toBe(4.2)
    expect(out.reviewsCount).toBe(3)
    expect(out).not.toHaveProperty('avgRatingAsClient')
  })
})

describe('дві ролі однієї людини', () => {
  it('мапери не плутають репутацію майстра і замовника', () => {
    // Одна людина може бути і виконавцем, і замовником — рейтинги різні,
    // і показувати треба той, у якій ролі її зараз видно.
    const row = {
      id: 'u1',
      avgRatingAsMaster: 5,
      reviewsCountAsMaster: 40,
      avgRatingAsClient: 3,
      reviewsCountAsClient: 2,
    }

    expect(flattenMasterRating(row).avgRating).toBe(5)
    expect(flattenClientRating(row).avgRating).toBe(3)
  })
})
