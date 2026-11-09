import { fail, redirect } from '@sveltejs/kit'
import QRCode from 'qrcode'
import { prisma } from '$lib/server/prisma'
import { limit } from '$lib/server/rate-limit'
import { requireStaffNoStepUp } from '$lib/server/admin/guard'
import { forgetVerified, isVerified, markVerified } from '$lib/server/admin/step-up'
import {
  decryptSecret,
  encryptSecret,
  newSecret,
  otpauthUri,
  verifyCode,
} from '$lib/server/admin/totp'
import { logAdmin } from '$lib/server/admin/audit'
import { sendTelegramText } from '$lib/server/telegram'
import { safeRedirectTarget } from '$lib/utils/redirect'
import type { Actions, PageServerLoad } from './$types'

// Вхід в адмінку — код другого фактора на кожну сесію (діє 12 годин).
// Першого разу — налаштування: QR для застосунку-автентифікатора й
// перший код, що підтверджує, що застосунок налаштовано правильно.

function target(raw: string | null): string {
  const path = safeRedirectTarget(raw)
  return path === '/admin' || path.startsWith('/admin/') ? path : '/admin'
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const staff = await requireStaffNoStepUp(locals)
  if (isVerified(staff.sessionId)) redirect(303, target(url.searchParams.get('redirectTo')))

  const row = await prisma.staffTwoFactor.findUnique({
    where: { userId: staff.id },
    select: { secret: true, enabledAt: true },
  })
  if (row?.enabledAt) return { mode: 'verify' as const }

  // Налаштування ще не завершене — той самий секрет, поки людина не
  // введе перший код (інакше кожне оновлення сторінки ламало б уже
  // відсканований QR).
  let secret: string
  if (row) {
    secret = decryptSecret(row.secret)
  } else {
    secret = newSecret()
    await prisma.staffTwoFactor.create({
      data: { userId: staff.id, secret: encryptSecret(secret) },
    })
  }

  // Матриця, а не готова картинка: сторінка малює її сама (круглі точки,
  // фірмові «очі», знак Zunor посередині). Під знак іде ~5% площі, тож
  // корекція Q (25%) — із запасом; H зробила б код помітно густішим.
  const { modules } = QRCode.create(otpauthUri(secret, locals.user?.email ?? 'staff'), {
    errorCorrectionLevel: 'Q',
  })
  return {
    mode: 'setup' as const,
    qr: { size: modules.size, cells: Array.from(modules.data, (b) => (b ? '1' : '0')).join('') },
    // Для ручного введення, якщо камера не бере QR. Лише до першого коду.
    secret: secret.replace(/(.{4})/g, '$1 ').trim(),
  }
}

// Дії іменовані: SvelteKit не дозволяє `default` поруч з іншими (`lock`).
export const actions: Actions = {
  verify: async (event) => {
    const { locals, request, url } = event
    const staff = await requireStaffNoStepUp(locals)

    // Шість цифр перебором — мільйон варіантів; 5 спроб за 5 хвилин.
    const rl = limit(`admin-2fa:${staff.id}`, { points: 5, duration: 5 * 60_000 })
    if (!rl.success) {
      return fail(429, { error: 'Забагато спроб. Зачекайте кілька хвилин.' })
    }

    const code = String((await request.formData()).get('code') ?? '')
    const row = await prisma.staffTwoFactor.findUnique({ where: { userId: staff.id } })
    if (!row) return fail(400, { error: 'Оновіть сторінку й спробуйте ще раз.' })

    const step = verifyCode(decryptSecret(row.secret), code, row.lastStep)
    if (step === null) return fail(400, { error: 'Невірний код' })

    const firstTime = !row.enabledAt
    await prisma.staffTwoFactor.update({
      where: { userId: staff.id },
      data: { lastStep: step, enabledAt: row.enabledAt ?? new Date() },
    })
    markVerified(staff.sessionId)

    await logAdmin(event, staff.id, firstTime ? 'auth.2fa_setup' : 'auth.2fa')

    // Вхід під твоїм акаунтом, який робив не ти, — видно одразу.
    let ip = ''
    try {
      ip = event.getClientAddress()
    } catch {
      // без адреси
    }
    void sendTelegramText(
      staff.id,
      `Вхід в адмінку Zunor${ip ? ` з адреси ${ip}` : ''}. Якщо це не ви — ` +
        'негайно змініть пароль і повідомте адміністратора.',
    )

    redirect(303, target(url.searchParams.get('redirectTo')))
  },

  /** «Заблокувати адмінку»: код знадобиться знову, сесія на сайті лишається. */
  lock: async ({ locals }) => {
    const staff = await requireStaffNoStepUp(locals)
    forgetVerified(staff.sessionId)
    redirect(303, '/admin/2fa')
  },
}
