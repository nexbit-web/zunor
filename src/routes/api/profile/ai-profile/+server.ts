import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import { limit } from '$lib/server/rate-limit'
import { parseAiProfile } from '$lib/server/zunor/ai-profile'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireApiUser(locals)

  const rl = limit(`ai-profile:${user.id}`, {
    points: 30,
    duration: 60 * 60_000,
  })
  if (!rl.success) throw error(429, 'Забагато спроб. Спробуйте пізніше.')

  // Роль перевіряємо на сервері, а не покладаємось на приховування в UI:
  // майстер може просто відкрити DevTools і надіслати запит руками.
  // Анкета — інструмент замовника; майстер заявок не створює.
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  })
  if (me?.role !== 'CLIENT') {
    throw error(403, 'Анкета доступна лише замовникам')
  }

  const body = await request.json().catch(() => null)
  // parseAiProfile відкидає все, чого немає в пресетах, і санітизує текст.
  const profile = parseAiProfile(body)

  await prisma.user.update({
    where: { id: user.id },
    data: { aiProfile: profile },
  })

  return json({ ok: true })
}
