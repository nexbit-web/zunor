import { describe, it, expect } from 'vitest'
import {
  QUICK_REACTION,
  REACTIONS,
  applyReaction,
  groupReactions,
  isReaction,
  myReaction,
  nextReaction,
} from '$lib/components/chat/reactions'

// Реакції в чаті. Одна від людини на повідомлення, як у Telegram без
// Premium: та сама ще раз — знімає, інша — замінює. Правило живе тут і
// однакове для браузера (оптимістичний показ) і сервера (запис).

const ME = 'me'
const PEER = 'peer'

describe('набір реакцій', () => {
  it('приймає лише емодзі з набору', () => {
    for (const e of REACTIONS) expect(isReaction(e)).toBe(true)
    // Будь-який рядок із тіла запиту поїхав би в базу й у чужу вкладку.
    for (const bad of ['💩', 'like', '', '<script>', null, 1, undefined]) {
      expect(isReaction(bad)).toBe(false)
    }
  })

  it('швидка реакція — з набору', () => {
    expect(isReaction(QUICK_REACTION)).toBe(true)
  })
})

describe('групування рядків із бази', () => {
  it('групи — у порядку першої появи, з усіма, хто поставив', () => {
    expect(
      groupReactions([
        { emoji: '👍', userId: PEER },
        { emoji: '❤️', userId: ME },
        { emoji: '👍', userId: 'x' },
      ]),
    ).toEqual([
      { emoji: '👍', userIds: [PEER, 'x'] },
      { emoji: '❤️', userIds: [ME] },
    ])
  })

  // Набір могли звузити, а старі рядки в базі лишились.
  it('емодзі поза набором не показується', () => {
    expect(groupReactions([{ emoji: '💩', userId: PEER }])).toEqual([])
  })

  it('порожньо чи нічого — порожній список, а не падіння', () => {
    expect(groupReactions(undefined)).toEqual([])
    expect(groupReactions(null)).toEqual([])
    expect(groupReactions([])).toEqual([])
  })
})

describe('натиск на емодзі', () => {
  const groups = [
    { emoji: '❤️', userIds: [ME, PEER] },
    { emoji: '👍', userIds: ['x'] },
  ]

  it('моя реакція видна', () => {
    expect(myReaction(groups, ME)).toBe('❤️')
    expect(myReaction(groups, 'nobody')).toBeNull()
  })

  it('та сама ще раз — знімає', () => {
    expect(nextReaction(groups, ME, '❤️')).toBeNull()
  })

  it('інша — замінює', () => {
    expect(nextReaction(groups, ME, '👍')).toBe('👍')
  })

  it('без моєї — ставить', () => {
    expect(nextReaction([], ME, '🔥')).toBe('🔥')
  })
})

describe('стан після зміни', () => {
  it('заміна прибирає стару й не лишає порожніх груп', () => {
    const before = [{ emoji: '❤️', userIds: [ME] }]
    expect(applyReaction(before, ME, '👍')).toEqual([
      { emoji: '👍', userIds: [ME] },
    ])
  })

  it('чужа реакція лишається', () => {
    const before = [{ emoji: '❤️', userIds: [ME, PEER] }]
    expect(applyReaction(before, ME, null)).toEqual([
      { emoji: '❤️', userIds: [PEER] },
    ])
  })

  it('та сама, що в іншого, — додаюсь до його групи', () => {
    const before = [{ emoji: '❤️', userIds: [PEER] }]
    expect(applyReaction(before, ME, '❤️')).toEqual([
      { emoji: '❤️', userIds: [PEER, ME] },
    ])
  })

  it('вхідний масив не мутується — відкат на попередній стан працює', () => {
    const before = [{ emoji: '❤️', userIds: [ME] }]
    applyReaction(before, ME, '👍')
    expect(before).toEqual([{ emoji: '❤️', userIds: [ME] }])
  })
})
