import { dev } from '$app/environment'
import { sendEmail } from '../email'

// Повний union із сигнатури emailOTP.sendVerificationOTP (better-auth 1.6).
// 'change-email' зараз недосяжний — changeEmail у плагіні вимкнено, —
// але тримаємо копію готовою: інакше вмикання опції дасть лист
// із неправильним текстом замість помилки компіляції.
type OtpType =
  | 'sign-in'
  | 'email-verification'
  | 'forget-password'
  | 'change-email'

const TTL_MINUTES = 10

const COPY: Record<
  OtpType,
  { subject: string; heading: string; lead: string }
> = {
  'email-verification': {
    subject: 'Підтвердіть email — Zunor',
    heading: 'Код підтвердження',
    lead: 'Введіть цей код на сайті, щоб підтвердити свою адресу:',
  },
  'forget-password': {
    subject: 'Скидання пароля — Zunor',
    heading: 'Код для скидання пароля',
    lead: 'Введіть цей код, щоб задати новий пароль:',
  },
  'sign-in': {
    subject: 'Код для входу — Zunor',
    heading: 'Код для входу',
    lead: 'Введіть цей код, щоб увійти:',
  },
  'change-email': {
    subject: 'Підтвердження нової пошти — Zunor',
    heading: 'Код для зміни пошти',
    lead: 'Введіть цей код, щоб привʼязати цю адресу до акаунта:',
  },
}

/** OTP — тільки цифри від better-auth, але фільтруємо як будь-який ввід у HTML. */
function buildHtml(otp: string, type: OtpType): string {
  const { heading, lead } = COPY[type]
  const safeOtp = otp.replace(/[^0-9]/g, '')

  return `<!DOCTYPE html>
<html lang="uk"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting"><title>${heading} — Zunor</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Ваш код: ${safeOtp}. Дійсний ${TTL_MINUTES} хвилин.</div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f5f5f5;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="480" style="max-width:480px;background:#fff;border-radius:16px;">
        <tr><td style="padding:40px 40px 0;">
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#0a0a0a;letter-spacing:-.02em;">${heading}</h1>
        </td></tr>
        <tr><td style="padding:12px 40px 0;">
          <p style="margin:0;font-size:15px;line-height:1.6;color:#555;">${lead}</p>
        </td></tr>
        <tr><td style="padding:24px 40px 0;">
          <div style="background:#f5f6fa;border-radius:12px;padding:24px;text-align:center;">
            <span style="font-size:40px;font-weight:800;letter-spacing:8px;color:#0a0a0a;font-family:'SF Mono',Monaco,Consolas,monospace;">${safeOtp}</span>
          </div>
        </td></tr>
        <tr><td style="padding:24px 40px 40px;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#888;">
            Код дійсний ${TTL_MINUTES} хвилин. Якщо ви не запитували його — просто проігноруйте цей лист.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export async function sendOtpEmail(params: {
  email: string
  otp: string
  type: OtpType
}): Promise<void> {
  const { email, otp, type } = params

  // Локально SMTP часто не налаштований — код у консоль, щоб флоу
  // проходився цілком, включно з requireEmailVerification.
  if (dev) console.log(`[otp] ${type} → ${email}: ${otp}`)

  await sendEmail({
    to: email,
    subject: COPY[type].subject,
    html: buildHtml(otp, type),
    text: `Ваш код Zunor: ${otp}\n\nДійсний ${TTL_MINUTES} хвилин.`,
    noRetry: true, // OTP термінові: краще швидкий fail і кнопка «надіслати ще раз»
  })
}
