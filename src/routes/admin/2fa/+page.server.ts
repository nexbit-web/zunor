import { fail, redirect } from '@sveltejs/kit'
import QRCode from 'qrcode'
import { prisma } from '$lib/server/prisma'
import { limit } from '$lib/server/rate-limit'
import { requireStaffNoStepUp } from '$lib/server/admin/guard'
import { isFreshSession } from '$lib/server/guards'
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
import { background } from '$lib/server/background'
import { safeRedirectTarget } from '$lib/utils/redirect'
import type { Actions, PageServerLoad } from './$types'

// * вхід в адмінку — код другого фактора на кожну сесію (діє 12 годин).
// * Першого разу — налаштування: QR для застосунку-автентифікатора й
// * перший код, що підтверджує, що застосунок налаштовано правильно

function target(raw: string | null): string {
  const path = safeRedirectTarget(raw)
  return path === '/admin' || path.startsWith('/admin/') ? path : '/admin'
}

// * перше налаштування другого фактора — лише одразу після входу: чужа жива
// * сесія привʼязала б адмінку до чужого телефона
const RELOGIN_TEXT =
  'Другий фактор налаштовується одразу після входу. Вийдіть з акаунта й увійдіть ще раз.'

export const load: PageServerLoad = async ({ locals, url }) => {
  const staff = await requireStaffNoStepUp(locals)
  if (await isVerified(staff.sessionId)) redirect(303, target(url.searchParams.get('redirectTo')))

  const row = await prisma.staffTwoFactor.findUnique({
    where: { userId: staff.id },
    select: { secret: true, enabledAt: true },
  })
  if (row?.enabledAt) return { mode: 'verify' as const }

  // * секрет і QR — лише свіжій сесії
  if (!isFreshSession(locals)) return { mode: 'relogin' as const }

  // * налаштування ще не завершене — той самий секрет, поки людина не
  // * введе перший код (інакше кожне оновлення сторінки ламало б уже
  // * відсканований QR)
  let secret: string
  if (row) {
    secret = decryptSecret(row.secret)
  } else {
    secret = newSecret()
    await prisma.staffTwoFactor.create({
      data: { userId: staff.id, secret: encryptSecret(secret) },
    })
  }

  // * матриця, а не готова картинка: сторінка малює її сама (круглі точки,
  // * фірмові «очі», знак Zunor посередині). Під знак іде ~5% площі, тож
  // * корекція Q (25%) — із запасом; H зробила б код помітно густішим
  const { modules } = QRCode.create(otpauthUri(secret, locals.user?.email ?? 'staff'), {
    errorCorrectionLevel: 'Q',
  })
  return {
    mode: 'setup' as const,
    qr: { size: modules.size, cells: Array.from(modules.data, (b) => (b ? '1' : '0')).join('') },
    // * для ручного введення, якщо камера не бере QR. Лише до першого коду
    secret: secret.replace(/(.{4})/g, '$1 ').trim(),
  }
}

// * дії іменовані: SvelteKit не дозволяє `default` поруч з іншими (`lock`)
export const actions: Actions = {
  verify: async (event) => {
    const { locals, request, url } = event
    const staff = await requireStaffNoStepUp(locals)

    // * шість цифр перебором — мільйон варіантів; 5 спроб за 5 хвилин
    const rl = await limit(`admin-2fa:${staff.id}`, { points: 5, duration: 5 * 60_000 })
    if (!rl.success) {
      return fail(429, { error: 'Забагато спроб. Зачекайте кілька хвилин.' })
    }

    const code = String((await request.formData()).get('code') ?? '')
    const row = await prisma.staffTwoFactor.findUnique({ where: { userId: staff.id } })
    if (!row) return fail(400, { error: 'Оновіть сторінку й спробуйте ще раз.' })

    const firstTime = !row.enabledAt
    // * перший код завершує налаштування — теж лише зі свіжою сесією
    if (firstTime && !isFreshSession(locals)) {
      return fail(403, { error: RELOGIN_TEXT })
    }

    const step = verifyCode(decryptSecret(row.secret), code, row.lastStep)
    if (step === null) return fail(400, { error: 'Невірний код' })

    // * умовний запис: код одноразовий, крок «займає» рівно один запит
    const claimed = await prisma.staffTwoFactor.updateMany({
      where: {
        userId: staff.id,
        OR: [{ lastStep: null }, { lastStep: { lt: step } }],
      },
      data: { lastStep: step, enabledAt: row.enabledAt ?? new Date() },
    })
    if (claimed.count !== 1) return fail(400, { error: 'Невірний код' })

    await markVerified(staff.sessionId)

    await logAdmin(event, staff.id, firstTime ? 'auth.2fa_setup' : 'auth.2fa')

    // * нова привʼязка автентифікатора — подія, про яку мають знати
    // * адміністратори: якщо це зробив не сам співробітник, його другий
    // * фактор скидають у «Співробітники»
    if (firstTime) {
      background(
        alertAdminsAboutSetup(staff.id, locals.user?.email ?? ''),
        'admin 2fa setup alert',
      )
    }

    // * вхід під твоїм акаунтом, який робив не ти, — видно одразу
    let ip = ''
    try {
      ip = event.getClientAddress()
    } catch {
      // * без адреси
    }
    background(
      sendTelegramText(
        staff.id,
        `Вхід в адмінку Zunor${ip ? ` з адреси ${ip}` : ''}. Якщо це не ви — ` +
          'негайно змініть пароль і повідомте адміністратора.',
      ),
      'admin login alert',
    )

    redirect(303, target(url.searchParams.get('redirectTo')))
  },

  /** «Заблокувати адмінку»: код знадобиться знову, сесія на сайті лишається. */
  lock: async ({ locals }) => {
    const staff = await requireStaffNoStepUp(locals)
    await forgetVerified(staff.sessionId)
    redirect(303, '/admin/2fa')
  },
}

/** Повідомлення в Telegram іншим адміністраторам (у кого він підключений). */
async function alertAdminsAboutSetup(staffId: string, email: string): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', banned: false, id: { not: staffId } },
    select: { id: true },
    take: 20,
  })
  await Promise.all(
    admins.map((a) =>
      sendTelegramText(
        a.id,
        `Співробітник${email ? ` ${email}` : ''} налаштував другий фактор адмінки Zunor. ` +
          'Якщо ви цього не очікували — скиньте його другий фактор у розділі «Співробітники».',
      ),
    ),
  )
}
