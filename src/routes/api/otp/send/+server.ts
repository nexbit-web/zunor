// src/routes/api/otp/send/+server.ts
import { json } from '@sveltejs/kit'
import { prisma } from '$lib/prisma'
import { sendEmail } from '$lib/email'
import { dev } from '$app/environment'
import type { RequestHandler } from './$types'

// ═══════════════════════════════════════════════════════════
// Константи
// ═══════════════════════════════════════════════════════════

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const EMAIL_MAX_LENGTH = 254
const OTP_EXPIRES_MIN = 10

// Rate limit per email
const RATE_LIMIT_PER_EMAIL_WINDOW_MIN = 1
const RATE_LIMIT_PER_EMAIL_MAX = 3

// Rate limit per IP — захист від атак на багато email одразу
const RATE_LIMIT_PER_IP_WINDOW_MIN = 5
const RATE_LIMIT_PER_IP_MAX = 10

// ═══════════════════════════════════════════════════════════
// In-memory IP rate limiter
// ═══════════════════════════════════════════════════════════

// Зберігаємо у пам'яті, бо OtpCode має тільки email, не IP.
// Для multi-instance деплою (Vercel/Railway replicas) — варто винести у Redis.
interface IpEntry {
  count: number
  resetAt: number
}

const ipRequests = new Map<string, IpEntry>()
const IP_CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // чистимо стару пам'ять раз на 5 хв

// Періодичне очищення — щоб Map не ріс безкінечно
let cleanupInterval: ReturnType<typeof setInterval> | null = null
function ensureCleanup() {
  if (cleanupInterval) return
  cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [ip, entry] of ipRequests.entries()) {
      if (entry.resetAt < now) ipRequests.delete(ip)
    }
  }, IP_CLEANUP_INTERVAL_MS)
}

function checkIpRateLimit(ip: string): boolean {
  ensureCleanup()
  const now = Date.now()
  const entry = ipRequests.get(ip)

  if (!entry || entry.resetAt < now) {
    ipRequests.set(ip, {
      count: 1,
      resetAt: now + RATE_LIMIT_PER_IP_WINDOW_MIN * 60 * 1000,
    })
    return true
  }

  if (entry.count >= RATE_LIMIT_PER_IP_MAX) {
    return false
  }

  entry.count++
  return true
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

/**
 * Криптографічно стійкий 6-значний OTP.
 * Math.random() непередбачувано на старих системах — crypto API краще.
 */
function generateSecureOtp(): string {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  const num = 100000 + (buf[0] % 900000)
  return String(num)
}

/**
 * Маскує email для логів — захист PII.
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '[invalid]'
  const masked =
    local.length <= 2
      ? local[0] + '*'
      : local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
  return `${masked}@${domain}`
}

/**
 * HTML-шаблон листа з кодом.
 * Bulletproof для Gmail, Outlook, Apple Mail.
 */
function buildOtpEmailHtml(code: string): string {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Код підтвердження — Zunor</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <!-- Hidden preheader -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Ваш код підтвердження: ${code}. Дійсний ${OTP_EXPIRES_MIN} хвилин.
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="480" style="max-width: 480px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <tr>
            <td style="padding: 40px 40px 0 40px;">
              <div style="display: inline-block; width: 48px; height: 48px; background-color: #f0f0f0; border-radius: 12px; text-align: center; line-height: 48px; font-size: 24px;">✉️</div>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px 0 40px;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #0a0a0a; line-height: 1.3; letter-spacing: -0.02em;">
                Код підтвердження
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 40px 0 40px;">
              <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #555555;">
                Введіть цей код на сайті, щоб підтвердити email:
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px 0 40px;">
              <div style="background-color: #f5f6fa; border-radius: 12px; padding: 24px; text-align: center;">
                <span style="font-size: 40px; font-weight: 800; letter-spacing: 8px; color: #0a0a0a; font-family: 'SF Mono', Monaco, Consolas, monospace;">${code}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px 0 40px;">
              <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #888888;">
                Код дійсний <strong style="color: #555;">${OTP_EXPIRES_MIN} хвилин</strong>. Якщо ви не запитували код — просто проігноруйте цей лист.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px 40px 40px;">
              <hr style="border: none; border-top: 1px solid #ececec; margin: 0 0 16px 0;">
              <p style="margin: 0; font-size: 11px; line-height: 1.5; color: #aaaaaa; text-align: center;">
                Цей лист надіслано автоматично, відповідати на нього не потрібно.<br>
                © Zunor — онлайн-сервіс замовлення послуг
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ═══════════════════════════════════════════════════════════
// POST /api/otp/send
// ═══════════════════════════════════════════════════════════

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  // ─── 1. IP rate limit (перший рівень захисту) ───
  const ip = getClientAddress()
  if (!checkIpRateLimit(ip)) {
    return json(
      { error: 'Забагато запитів. Спробуйте пізніше.' },
      { status: 429 },
    )
  }

  // ─── 2. Парсинг body ───
  let email: string
  try {
    const body = await request.json()
    email = String(body?.email ?? '')
      .trim()
      .toLowerCase()
  } catch {
    return json({ error: 'Невірний формат запиту' }, { status: 400 })
  }

  // ─── 3. Валідація email ───
  if (!email || email.length > EMAIL_MAX_LENGTH || !EMAIL_RE.test(email)) {
    return json({ error: 'Невірний формат email' }, { status: 400 })
  }

  // ─── 4. Per-email rate limit (другий рівень) ───
  const sinceDate = new Date(
    Date.now() - RATE_LIMIT_PER_EMAIL_WINDOW_MIN * 60 * 1000,
  )

  let recentCount: number
  try {
    recentCount = await prisma.otpCode.count({
      where: {
        email,
        createdAt: { gte: sinceDate },
      },
    })
  } catch (err) {
    console.error('[otp/send] DB count failed:', err)
    return json({ error: 'Сервіс тимчасово недоступний' }, { status: 503 })
  }

  if (recentCount >= RATE_LIMIT_PER_EMAIL_MAX) {
    return json(
      { error: 'Забагато спроб. Зачекайте хвилину.' },
      { status: 429 },
    )
  }

  // ─── 5. Генерація коду ───
  const code = generateSecureOtp()
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_MIN * 60 * 1000)

  // ─── 6. Транзакція: видалити старі коди + створити новий ───
  // Атомарність — або обидва, або жоден.
  let createdId: string | null = null
  try {
    const [, created] = await prisma.$transaction([
      prisma.otpCode.deleteMany({ where: { email } }),
      prisma.otpCode.create({
        data: { email, code, expiresAt },
      }),
    ])
    createdId = created.id
  } catch (err) {
    console.error('[otp/send] DB transaction failed:', err)
    return json({ error: 'Сервіс тимчасово недоступний' }, { status: 503 })
  }

  // ─── 7. Відправка листа ───
  try {
    await sendEmail({
      to: email,
      subject: 'Ваш код підтвердження — Zunor',
      html: buildOtpEmailHtml(code),
      text: `Ваш код підтвердження Zunor: ${code}\n\nКод дійсний ${OTP_EXPIRES_MIN} хвилин. Якщо ви не запитували код — проігноруйте цей лист.\n\n— Zunor`,
      noRetry: true, // OTP термінові — не варто чекати retry, краще швидкий fail
    })
  } catch (err) {
    if (dev) {
      console.error('[otp/send] mail failed for', maskEmail(email), ':', err)
    } else {
      console.error('[otp/send] mail failed:', err)
    }

    // Видаляємо OTP — лист не пішов, юзер не зможе його ввести
    if (createdId) {
      await prisma.otpCode.delete({ where: { id: createdId } }).catch(() => {
        // ignore — у крайньому випадку код просто застаріє через expiresAt
      })
    }

    return json(
      { error: 'Не вдалось відправити код. Спробуйте пізніше.' },
      { status: 500 },
    )
  }

  // ─── 8. Успіх ───
  if (dev) {
    console.log('[otp/send] ✅ sent to', maskEmail(email))
  }

  return json({ ok: true })
}
