// * другий фактор /admin — TOTP (RFC 6238). Свій, а не плагін better-auth: той
// * вбудований у вхід паролем і оминався б входом через Google. Секрет у базі
// * зашифрований (AES-256-GCM); той самий код двічі не проходить (lastStep)

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import * as OTPAuth from 'otpauth'
import { env } from '$env/dynamic/private'

const PERIOD = 30
const ISSUER = 'Zunor Admin'

function key(): Buffer {
  const secret = env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET не задано')
  return createHash('sha256').update(`zunor-staff-totp:${secret}`).digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, data].map((b) => b.toString('base64url')).join('.')
}

export function decryptSecret(stored: string): string {
  const [iv, tag, data] = stored.split('.').map((s) => Buffer.from(s, 'base64url'))
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

/** Новий секрет (base32 — те, що вводять руками, якщо QR не сканується). */
export function newSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32
}

function totp(secretBase32: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  })
}

/**
 * otpauth://… для QR-коду. Без algorithm/digits/period — це значення за
 * замовчуванням, а коротше посилання дає рідший QR.
 */
export function otpauthUri(secretBase32: string, email: string): string {
  const issuer = encodeURIComponent(ISSUER)
  return `otpauth://totp/${issuer}:${encodeURIComponent(email)}?secret=${secretBase32}&issuer=${issuer}`
}

/**
 * Номер 30-секундного кроку коду (зберегти в lastStep) або null. Вікно ±1
 * крок — на розбіжність годинників; крок, не новіший за використаний, — повтор.
 */
export function verifyCode(
  secretBase32: string,
  code: string,
  lastStep: number | null,
  now = Date.now(),
): number | null {
  const token = code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(token)) return null

  const delta = totp(secretBase32).validate({ token, timestamp: now, window: 1 })
  if (delta === null) return null

  const step = Math.floor(now / 1000 / PERIOD) + delta
  if (lastStep !== null && step <= lastStep) return null
  return step
}
