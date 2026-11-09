import { describe, it, expect } from 'vitest'
import {
  createLinkToken,
  verifyLinkToken,
  LINK_TTL_MS,
} from '$lib/server/telegram/link-token'

// Токен привʼязки Telegram: /start <токен> записує чат бота за акаунтом.
// Підроблений токен = чужі сповіщення (нові заявки, замовлення) у чужому
// Telegram, тож стережемо підпис, строк і формат, який приймає Telegram.

const SECRET = 'test-secret'
const USER = 'cmh1a2b3c4d5e6f7g8h9i0j1k'
const NOW = 1_800_000_000_000

describe('токен привʼязки Telegram', () => {
  it('свій токен повертає userId', () => {
    const t = createLinkToken(USER, SECRET, NOW)
    expect(verifyLinkToken(t, SECRET, NOW + 1000)).toBe(USER)
  })

  it('влазить у параметр start: до 64 символів, лише A-Z a-z 0-9 _ -', () => {
    const t = createLinkToken(USER, SECRET, NOW)
    expect(t.length).toBeLessThanOrEqual(64)
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('чужий userId із тим самим підписом не проходить', () => {
    const t = createLinkToken(USER, SECRET, NOW)
    const forged = t.replace(USER, 'cmhattacker000000000000000')
    expect(verifyLinkToken(forged, SECRET, NOW)).toBeNull()
  })

  it('підписаний іншим секретом не проходить', () => {
    const t = createLinkToken(USER, 'other-secret', NOW)
    expect(verifyLinkToken(t, SECRET, NOW)).toBeNull()
  })

  it('прострочений не проходить', () => {
    const t = createLinkToken(USER, SECRET, NOW)
    expect(verifyLinkToken(t, SECRET, NOW + LINK_TTL_MS + 1000)).toBeNull()
  })

  it('продовжений строк у токені ламає підпис', () => {
    const t = createLinkToken(USER, SECRET, NOW)
    const [id, , sig] = [
      t.slice(0, t.indexOf('_')),
      '',
      t.slice(t.indexOf('_', t.indexOf('_') + 1) + 1),
    ]
    const later = Math.floor((NOW + 365 * 86_400_000) / 1000).toString(36)
    expect(verifyLinkToken(`${id}_${later}_${sig}`, SECRET, NOW)).toBeNull()
  })

  it('сміття замість токена — null, а не виняток', () => {
    for (const junk of ['', '_', 'abc', 'a_b', '__x', 'x'.repeat(65), 'a b_c_d']) {
      expect(verifyLinkToken(junk, SECRET, NOW)).toBeNull()
    }
  })
})
