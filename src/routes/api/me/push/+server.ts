import { error, json } from '@sveltejs/kit'
import { prisma } from '$lib/server/prisma'
import { requireApiUser } from '$lib/server/guards'
import { limit } from '$lib/server/rate-limit'
import { isPushPlatform, isPushToken, MAX_DEVICES } from '$lib/server/push'
import type { RequestHandler } from './$types'

async function readToken(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: unknown
    platform?: unknown
  } | null
  if (!isPushToken(body?.token)) error(400, 'Некоректний токен пристрою')
  return { token: body.token, platform: body.platform }
}

/**
 * POST /api/me/push — цей пристрій отримує push-сповіщення
 * ($lib/server/push). Тіло: { token: 'ExponentPushToken[…]', platform:
 * 'ios' | 'android' }.
 *
 * Застосунок кличе його при кожному запуску з увімкненим push — токен
 * може змінитись, а запис лише оновлюється. Той самий токен в іншого
 * акаунта (на телефоні увійшли іншим) переходить до цього: один пристрій
 * — один акаунт, як і чат Telegram. Пристроїв понад MAX_DEVICES —
 * найдавніші геть.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireApiUser(locals)

  const rl = await limit(`push-register:${user.id}`, {
    points: 30,
    duration: 60 * 60_000,
  })
  if (!rl.success) error(429, 'Забагато запитів. Спробуйте пізніше.')

  const { token, platform } = await readToken(request)
  if (!isPushPlatform(platform)) error(400, 'Некоректна платформа')

  await prisma.pushToken.upsert({
    where: { token },
    create: { userId: user.id, token, platform },
    // updatedAt оновлюється й без змін — так видно, що пристрій живий.
    update: { userId: user.id, platform },
  })

  const extra = await prisma.pushToken.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    skip: MAX_DEVICES,
    select: { id: true },
  })
  if (extra.length) {
    await prisma.pushToken.deleteMany({
      where: { id: { in: extra.map((r) => r.id) } },
    })
  }

  return json({ ok: true })
}

/**
 * DELETE /api/me/push — цей пристрій більше не отримує push: людина
 * вимкнула їх у налаштуваннях або виходить з акаунта. Тіло: { token }.
 * Лише свій запис: чужий токен мовчки нічого не видаляє.
 */
export const DELETE: RequestHandler = async ({ request, locals }) => {
  const user = requireApiUser(locals)
  const { token } = await readToken(request)
  await prisma.pushToken.deleteMany({ where: { token, userId: user.id } })
  return json({ ok: true })
}
