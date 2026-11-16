import { error, json } from '@sveltejs/kit'
import { isFreshSession, requireApiUser } from '$lib/server/guards'
import { limit } from '$lib/server/rate-limit'
import { deleteAccount } from '$lib/server/account-deletion'
import type { RequestHandler } from './$types'

/**
 * DELETE /api/me — видалити свій акаунт (знеособлення). Тіло:
 * { confirm: '<своя пошта>' }. 403 — сесія не свіжа, 409 — є активні замовлення.
 */
export const DELETE: RequestHandler = async ({ request, locals }) => {
  const user = requireApiUser(locals)

  const rl = await limit(`account-delete:${user.id}`, {
    points: 5,
    duration: 10 * 60_000,
  })
  if (!rl.success) error(429, 'Забагато спроб. Спробуйте пізніше.')

  const body = (await request.json().catch(() => null)) as {
    confirm?: unknown
  } | null
  const confirm =
    typeof body?.confirm === 'string' ? body.confirm.trim().toLowerCase() : ''

  if (!confirm || confirm !== user.email.trim().toLowerCase()) {
    error(400, 'Пошта не збігається')
  }

  // * незворотне — лише одразу після входу: вкрадена cookie не має стирати акаунт
  if (!isFreshSession(locals)) {
    error(
      403,
      'Щоб видалити акаунт, вийдіть і увійдіть ще раз — так ми переконаємось, що це ви.',
    )
  }

  const result = await deleteAccount(user.id)

  if (!result.ok) {
    if (result.reason === 'active-orders') {
      error(
        409,
        'Спершу завершіть або скасуйте активні замовлення — на вас розраховують.',
      )
    }
    error(404, 'Не знайдено')
  }

  return json({ ok: true })
}
