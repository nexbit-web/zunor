import { transporter, SMTP_FROM } from './mailer'
import { dev } from '$app/environment'

// ═══════════════════════════════════════════════════════════
// Константи
// ═══════════════════════════════════════════════════════════

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const EMAIL_MAX_LENGTH = 254 // RFC 5321
const SUBJECT_MAX_LENGTH = 200
const SEND_TIMEOUT_MS = 15_000 // 15 сек таймаут на SMTP
const SEND_RETRIES = 2 // повторні спроби при тимчасових помилках

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

/**
 * Екранує користувацькі дані у HTML — захист від XSS у листах.
 * Якщо ім'я юзера містить теги — вони не виконаються в email-клієнті.
 */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Конвертує HTML у plain text (fallback для клієнтів без HTML).
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Перевіряє валідність email-адреси.
 */
function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return false
  return EMAIL_RE.test(email)
}

/**
 * Перевіряє чи URL безпечний для використання у листах.
 * Дозволяємо тільки http/https — захист від javascript:/data: URL-injection.
 */
function isValidHttpUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Маскує email для логів: i***@example.com — захист PII.
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
 * Перевіряє чи помилка тимчасова (можна retry):
 * - Network errors (ECONNRESET, ETIMEDOUT)
 * - SMTP 4xx (Try again later)
 *
 * 5xx (permanent) і помилки авторизації — НЕ retry.
 */
function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const code = (err as NodeJS.ErrnoException).code
  if (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED'
  ) {
    return true
  }
  // SMTP transient errors (4xx)
  const responseCode = (err as { responseCode?: number }).responseCode
  if (responseCode && responseCode >= 400 && responseCode < 500) {
    return true
  }
  return false
}

/**
 * Sleep утиліта для exponential backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ═══════════════════════════════════════════════════════════
// Базова функція відправки
// ═══════════════════════════════════════════════════════════

interface SendEmailParams {
  to: string
  subject: string
  html: string
  text?: string
  /** Якщо true — НЕ робити retry. Для термінових листів типу OTP. */
  noRetry?: boolean
}

/**
 * Базова функція відправки email через nodemailer.
 *
 * Особливості:
 *  - Валідація email і теми перед відправкою.
 *  - Таймаут 15 секунд — щоб не зависнути на повільному SMTP.
 *  - Retry до 2 разів при тимчасових помилках (з exponential backoff).
 *  - Plain text fallback автоматично з HTML.
 *  - PII (email) маскується у логах.
 */
async function sendEmail({
  to,
  subject,
  html,
  text,
  noRetry = false,
}: SendEmailParams): Promise<void> {
  // ─── Валідація ───
  if (!isValidEmail(to)) {
    throw new Error(`[email] Invalid recipient address`)
  }
  if (!subject || subject.length > SUBJECT_MAX_LENGTH) {
    throw new Error(`[email] Invalid subject (length ${subject?.length ?? 0})`)
  }
  if (!html || html.length === 0) {
    throw new Error('[email] Empty HTML body')
  }

  const finalText = text ?? stripHtml(html)
  const maxAttempts = noRetry ? 1 : SEND_RETRIES + 1
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // ─── Таймаут на відправку ───
      // Деякі SMTP-сервери можуть зависнути назавжди — захист.
      await Promise.race([
        transporter.sendMail({
          from: SMTP_FROM,
          to,
          subject,
          html,
          text: finalText,
          // Захист від email-bouncing зловживань
          headers: {
            'X-Auto-Response-Suppress': 'All',
            'Auto-Submitted': 'auto-generated',
          },
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('SMTP timeout')), SEND_TIMEOUT_MS),
        ),
      ])

      // Успіх — лог тільки в dev (на проді PII лог = погано)
      if (dev) {
        console.log(`[email] ✅ sent to ${maskEmail(to)} (attempt ${attempt})`)
      }
      return
    } catch (err) {
      lastError = err

      const shouldRetry =
        !noRetry && attempt < maxAttempts && isRetryableError(err)

      if (dev) {
        console.error(
          `[email] ❌ attempt ${attempt} failed for ${maskEmail(to)}:`,
          err,
        )
      }

      if (!shouldRetry) break

      // Exponential backoff: 500ms, 1500ms, 4500ms…
      const delay = 500 * Math.pow(3, attempt - 1)
      await sleep(delay)
    }
  }

  // Усі спроби вичерпано
  const errorMessage =
    lastError instanceof Error ? lastError.message : 'Unknown error'
  throw new Error(
    `[email] Failed after ${maxAttempts} attempts: ${errorMessage}`,
  )
}

// ═══════════════════════════════════════════════════════════
// PUBLIC: Відновлення паролю
// ═══════════════════════════════════════════════════════════

interface SendResetPasswordParams {
  to: string
  name: string | null
  resetUrl: string
}

/**
 * Відправляє лист з посиланням на скидання паролю.
 *
 * Безпека:
 *  - Валідація URL (тільки http/https).
 *  - Екранування name (захист від XSS у HTML-листі).
 *  - Plain text fallback.
 */
export async function sendResetPasswordEmail({
  to,
  name,
  resetUrl,
}: SendResetPasswordParams): Promise<void> {
  if (!isValidHttpUrl(resetUrl)) {
    throw new Error('[email] Invalid reset URL')
  }

  const displayName = name?.trim() || 'друже'
  const safeName = escapeHtml(displayName)
  const safeUrl = escapeHtml(resetUrl)

  const subject = 'Відновлення паролю — Zunor'

  const html = buildResetPasswordHtml({ safeName, safeUrl })

  // Plain text fallback (для клієнтів без HTML, accessibility)
  const text = `Привіт, ${displayName}!

Ви запросили відновлення паролю для свого акаунту Zunor.

Перейдіть за посиланням, щоб задати новий пароль:
${resetUrl}

Посилання дійсне 1 годину. Якщо ви не запитували відновлення — просто проігноруйте цей лист, ваш пароль не зміниться.

—
Zunor`

  await sendEmail({ to, subject, html, text })
}

// ═══════════════════════════════════════════════════════════
// HTML templates (винесені окремо для зручності та A/B тестів)
// ═══════════════════════════════════════════════════════════

interface ResetPasswordTemplateParams {
  safeName: string // вже екранований
  safeUrl: string // вже екранований
}

function buildResetPasswordHtml({
  safeName,
  safeUrl,
}: ResetPasswordTemplateParams): string {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Відновлення паролю — Zunor</title>
<!--[if mso]>
<style>* { font-family: Arial, sans-serif !important; }</style>
<![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <!-- Hidden preheader text — показується у inbox-preview -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Натисніть посилання, щоб задати новий пароль для Zunor. Дійсне 1 годину.
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="480" style="max-width: 480px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <!-- Header icon -->
          <tr>
            <td style="padding: 40px 40px 0 40px;">
              <div style="display: inline-block; width: 48px; height: 48px; background-color: #f0f0f0; border-radius: 12px; text-align: center; line-height: 48px; font-size: 24px;">🔐</div>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td style="padding: 24px 40px 0 40px;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #0a0a0a; line-height: 1.3; letter-spacing: -0.02em;">
                Привіт, ${safeName}!
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 16px 40px 0 40px;">
              <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #555555;">
                Ви запросили відновлення паролю для свого акаунту Zunor.
              </p>
              <p style="margin: 12px 0 0 0; font-size: 15px; line-height: 1.6; color: #555555;">
                Натисніть кнопку нижче, щоб задати новий пароль:
              </p>
            </td>
          </tr>

          <!-- CTA Button (з bulletproof MSO-fallback для Outlook) -->
          <tr>
            <td align="center" style="padding: 28px 40px 0 40px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeUrl}" style="height:48px;v-text-anchor:middle;width:200px;" arcsize="20%" stroke="f" fillcolor="#0a0a0a">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:600;">Відновити пароль</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="${safeUrl}" target="_blank" rel="noopener" style="display: inline-block; padding: 14px 32px; background-color: #0a0a0a; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px;">
                Відновити пароль
              </a>
              <!--<![endif]-->
            </td>
          </tr>

          <!-- Expiry note -->
          <tr>
            <td style="padding: 28px 40px 0 40px;">
              <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #888888;">
                Посилання дійсне <strong style="color: #555;">1 годину</strong>. Якщо ви не запитували відновлення — просто проігноруйте цей лист, ваш пароль не зміниться.
              </p>
            </td>
          </tr>

          <!-- Plain link fallback -->
          <tr>
            <td style="padding: 24px 40px 0 40px;">
              <hr style="border: none; border-top: 1px solid #ececec; margin: 0;">
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 40px 0 40px;">
              <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #aaaaaa;">
                Кнопка не працює? Скопіюйте це посилання у браузер:
              </p>
              <p style="margin: 6px 0 0 0; font-size: 12px; line-height: 1.5; color: #555555; word-break: break-all;">
                ${safeUrl}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 40px 40px 40px;">
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
// Експорт утиліт для інших email-шаблонів
// ═══════════════════════════════════════════════════════════

// Якщо в інших файлах потрібно слати email — використовуйте sendEmail.
// Утиліти escapeHtml/isValidEmail можна теж винести у спільний шлях.
export { sendEmail, escapeHtml, isValidEmail, isValidHttpUrl }
