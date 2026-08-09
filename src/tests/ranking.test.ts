import { describe, it, expect } from 'vitest'
import {
  getRecommendedIds,
  type RankableMaster,
  type RankableProposal,
} from '$lib/server/ranking'

// Ранжування відгуків — це те, що клієнт бачить очима: три картки під
// заголовком «рекомендовані» і решта під кнопкою. Тут перевіряється НЕ
// арифметика (константи в DISPATCH_CONFIG крутити можна), а обіцянки з
// маніфесту:
//
//   • топ формується за якістю майстра, а не за порядком у базі;
//   • новачок має ГАРАНТОВАНИЙ слот — інакше маркетплейс замикається на
//     тих, хто вже вгорі, і новий майстер не отримує першого замовлення
//     ніколи (розділ «справедливий маркетплейс»);
//   • перевантажений майстер з топу вилітає — клієнту потрібен той, хто
//     реально візьметься.

const NOW = new Date('2026-03-15T12:00:00Z')

const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000)

/** За замовчуванням — сильний ветеран: online, 5.0, верифікований. */
function master(over: Partial<RankableMaster> = {}): RankableMaster {
  return {
    lastSeen: minsAgo(1),
    avgRating: 5,
    isVerified: true,
    activeOrders: 0,
    masterSince: daysAgo(365),
    completedOrders: 50,
    ...over,
  }
}

function proposal(
  id: string,
  over: Partial<RankableMaster> = {},
  createdAt: Date = NOW,
): RankableProposal {
  return { id, createdAt, master: master(over) }
}

/** Новачок: і за віком профілю, і за кількістю замовлень. */
const NEWBIE: Partial<RankableMaster> = {
  masterSince: daysAgo(1),
  completedOrders: 0,
}

const rank = (proposals: RankableProposal[]) =>
  getRecommendedIds(proposals, NOW)

describe('порожній і короткий список', () => {
  it('без відгуків — порожні множини, без падінь', () => {
    const { recommended, newbies } = rank([])

    expect(recommended.size).toBe(0)
    expect(newbies.size).toBe(0)
  })

  it('менше трьох відгуків — рекомендовані всі', () => {
    const { recommended } = rank([proposal('a'), proposal('b')])

    expect([...recommended].sort()).toEqual(['a', 'b'])
  })

  it('рівно три — теж усі, без обмінів', () => {
    const { recommended } = rank([
      proposal('a'),
      proposal('b', NEWBIE),
      proposal('c'),
    ])

    expect(recommended.size).toBe(3)
  })
})

describe('топ формується за якістю майстра', () => {
  it('рекомендованих завжди рівно три, скільки б не відгукнулось', () => {
    const { recommended } = rank(
      Array.from({ length: 12 }, (_, i) => proposal(`p${i}`)),
    )

    expect(recommended.size).toBe(3)
  })

  it('свіжий майстер обходить того, кого не було тиждень', () => {
    const { recommended } = rank([
      proposal('stale-1', { lastSeen: daysAgo(7) }),
      proposal('stale-2', { lastSeen: daysAgo(7) }),
      proposal('stale-3', { lastSeen: daysAgo(7) }),
      proposal('online', { lastSeen: minsAgo(1) }),
    ])

    expect(recommended.has('online')).toBe(true)
  })

  it('верифікований обходить рівного неверифікованого', () => {
    const { recommended } = rank([
      proposal('plain-1', { isVerified: false }),
      proposal('plain-2', { isVerified: false }),
      proposal('plain-3', { isVerified: false }),
      proposal('verified', { isVerified: true }),
    ])

    expect(recommended.has('verified')).toBe(true)
  })

  it('вищий рейтинг обходить нижчий', () => {
    const { recommended } = rank([
      proposal('low-1', { avgRating: 3 }),
      proposal('low-2', { avgRating: 3 }),
      proposal('low-3', { avgRating: 3 }),
      proposal('top', { avgRating: 5 }),
    ])

    expect(recommended.has('top')).toBe(true)
  })

  // Штраф перевантаженому — щоб клієнт не обирав того, у кого вже три
  // замовлення в роботі й хто відгукнувся «про всяк випадок».
  it('перевантажений вилітає з топу навіть при ідеальному профілі', () => {
    const { recommended } = rank([
      proposal('free-1', { avgRating: 4 }),
      proposal('free-2', { avgRating: 4 }),
      proposal('free-3', { avgRating: 4 }),
      proposal('busy', { avgRating: 5, activeOrders: 3 }),
    ])

    expect(recommended.has('busy')).toBe(false)
  })
})

describe('гарантований слот новачку', () => {
  // Головна обіцянка маніфесту. Без неї новий майстер не потрапляє в топ
  // ніколи: у нього нема ні рейтингу, ні історії.
  it('слабкий новачок витісняє найслабшого з топ-3', () => {
    const { recommended } = rank([
      proposal('vet-strong', { lastSeen: minsAgo(1) }),
      proposal('vet-mid', { lastSeen: minsAgo(10) }),
      proposal('vet-weak', { lastSeen: minsAgo(45) }),
      proposal('newbie', {
        ...NEWBIE,
        lastSeen: daysAgo(2),
        avgRating: 0,
        isVerified: false,
      }),
    ])

    expect(recommended.has('newbie')).toBe(true)
    expect(recommended.has('vet-weak')).toBe(false)
    // Двоє найсильніших лишаються на місці — платимо рівно одним слотом.
    expect(recommended.has('vet-strong')).toBe(true)
    expect(recommended.has('vet-mid')).toBe(true)
  })

  it('якщо новачок і так у топі — нікого не міняють', () => {
    const { recommended } = rank([
      proposal('vet-1', { lastSeen: minsAgo(1) }),
      proposal('vet-2', { lastSeen: minsAgo(2) }),
      proposal('newbie-strong', { ...NEWBIE, lastSeen: minsAgo(3) }),
      proposal('vet-outsider', { lastSeen: daysAgo(3) }),
    ])

    expect(recommended.has('newbie-strong')).toBe(true)
    expect(recommended.has('vet-outsider')).toBe(false)
    expect(recommended.size).toBe(3)
  })

  it('слот дістається найкращому з новачків, а не будь-якому', () => {
    const { recommended } = rank([
      proposal('vet-1', { lastSeen: minsAgo(1) }),
      proposal('vet-2', { lastSeen: minsAgo(2) }),
      proposal('vet-3', { lastSeen: minsAgo(3) }),
      proposal('newbie-better', { ...NEWBIE, lastSeen: minsAgo(20) }),
      proposal('newbie-worse', { ...NEWBIE, lastSeen: daysAgo(5) }),
    ])

    expect(recommended.has('newbie-better')).toBe(true)
    expect(recommended.has('newbie-worse')).toBe(false)
  })

  it('слот один: другий новачок обміну не отримує', () => {
    const { recommended } = rank([
      proposal('vet-1', { lastSeen: minsAgo(1) }),
      proposal('vet-2', { lastSeen: minsAgo(2) }),
      proposal('vet-3', { lastSeen: minsAgo(3) }),
      proposal('newbie-a', { ...NEWBIE, lastSeen: minsAgo(20) }),
      proposal('newbie-b', { ...NEWBIE, lastSeen: minsAgo(25) }),
    ])

    expect(recommended.size).toBe(3)
    expect(recommended.has('vet-1')).toBe(true)
    expect(recommended.has('vet-2')).toBe(true)
  })

  it('коли новачків не відгукнулось — топ лишається ветеранським', () => {
    const ids = ['a', 'b', 'c', 'd']
    const { recommended, newbies } = rank(ids.map((id) => proposal(id)))

    expect(newbies.size).toBe(0)
    expect(recommended.size).toBe(3)
  })
})

describe('мітка «новачок»', () => {
  // Мітку бачить клієнт на картці — вона має стояти на всіх новачках,
  // а не лише на тому, кого підняли в топ.
  it('позначає всіх новачків, включно з тими, хто поза топом', () => {
    const { newbies } = rank([
      proposal('vet-1', { lastSeen: minsAgo(1) }),
      proposal('vet-2', { lastSeen: minsAgo(2) }),
      proposal('vet-3', { lastSeen: minsAgo(3) }),
      proposal('newbie-a', { ...NEWBIE, lastSeen: minsAgo(20) }),
      proposal('newbie-b', { ...NEWBIE, lastSeen: daysAgo(5) }),
    ])

    expect([...newbies].sort()).toEqual(['newbie-a', 'newbie-b'])
  })

  // Умова OR, а не AND — і це навмисно: обидва шляхи мають вести до мітки.
  it('свіжий профіль з великим досвідом — усе одно новачок', () => {
    const { newbies } = rank([
      proposal('fresh', { masterSince: daysAgo(3), completedOrders: 100 }),
    ])

    expect(newbies.has('fresh')).toBe(true)
  })

  it('старий профіль без замовлень — теж новачок', () => {
    const { newbies } = rank([
      proposal('idle', { masterSince: daysAgo(400), completedOrders: 1 }),
    ])

    expect(newbies.has('idle')).toBe(true)
  })

  it('рік у сервісі й десятки замовлень — уже не новачок', () => {
    const { newbies } = rank([proposal('veteran')])

    expect(newbies.has('veteran')).toBe(false)
  })
})

describe('чистота функції', () => {
  it('вхідний масив не мутується', () => {
    const input = [proposal('a'), proposal('b', NEWBIE), proposal('c')]
    const snapshot = input.map((p) => p.id)

    rank(input)

    expect(input.map((p) => p.id)).toEqual(snapshot)
  })

  it('рекомендовані — завжди підмножина переданих id', () => {
    const input = Array.from({ length: 7 }, (_, i) =>
      proposal(`p${i}`, i > 4 ? NEWBIE : {}),
    )
    const ids = new Set(input.map((p) => p.id))

    const { recommended, newbies } = rank(input)

    for (const id of [...recommended, ...newbies]) {
      expect(ids.has(id)).toBe(true)
    }
  })

  // Швидкість відгуку — друге правило сортування. Вибірка з БД іде за
  // createdAt DESC, тож без явного тайбрейку при рівних майстрах вигравав
  // той, хто відгукнувся ОСТАННІМ, — рівно навпаки до обіцяного в описі
  // модуля.
  it('при рівних майстрах виграє той, хто відгукнувся першим', () => {
    const ordered = [
      proposal('last', {}, minsAgo(1)),
      proposal('third', {}, minsAgo(10)),
      proposal('second', {}, minsAgo(30)),
      proposal('first', {}, minsAgo(60)),
    ]

    const { recommended } = rank(ordered)

    expect(recommended.has('first')).toBe(true)
    expect(recommended.has('last')).toBe(false)
  })

  // Тайбрейк саме ДРУГИЙ: швидкість не має підіймати слабкого майстра над
  // сильним — інакше в топі опинялися б ті, хто просто швидше тисне кнопку.
  it('швидкість не перебиває якість', () => {
    const { recommended } = rank([
      proposal('fast-but-stale', { lastSeen: daysAgo(7) }, minsAgo(60)),
      proposal('slow-but-online-1', { lastSeen: minsAgo(1) }, minsAgo(1)),
      proposal('slow-but-online-2', { lastSeen: minsAgo(1) }, minsAgo(1)),
      proposal('slow-but-online-3', { lastSeen: minsAgo(1) }, minsAgo(1)),
    ])

    expect(recommended.has('fast-but-stale')).toBe(false)
  })

  it('без явного now береться поточний час і функція не падає', () => {
    expect(() => getRecommendedIds([proposal('a')])).not.toThrow()
  })
})
