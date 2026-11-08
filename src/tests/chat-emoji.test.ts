import { describe, it, expect } from 'vitest'
import {
  EMOJI_GROUPS,
  RECENT_MAX,
  withRecent,
} from '$lib/components/chat/emoji'

// Панель емодзі в полі вводу чату.

describe('набір', () => {
  it('групи рівні — по 8 у ряд, без хвостів', () => {
    for (const g of EMOJI_GROUPS) expect(g.emoji.length % 8).toBe(0)
  })

  it('без повторів між групами', () => {
    const all = EMOJI_GROUPS.flatMap((g) => g.emoji)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('нещодавні', () => {
  it('обране — першим, без повторів', () => {
    expect(withRecent(['👍', '🙏', '❤️'], '🙏')).toEqual(['🙏', '👍', '❤️'])
  })

  it('стеля — найстаріше випадає', () => {
    const full = Array.from({ length: RECENT_MAX }, (_, i) => `e${i}`)
    const next = withRecent(full, '🧹')
    expect(next).toHaveLength(RECENT_MAX)
    expect(next[0]).toBe('🧹')
    expect(next).not.toContain(`e${RECENT_MAX - 1}`)
  })
})
