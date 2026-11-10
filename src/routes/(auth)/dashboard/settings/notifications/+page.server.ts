import { prisma } from '$lib/server/prisma'
import { requireUser } from '$lib/server/guards'
import { telegramEnabled, telegramLinkUrl } from '$lib/server/telegram'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const user = requireUser(locals, '/dashboard/settings/notifications')

  // Бот не налаштований (немає TELEGRAM_BOT_TOKEN) — блоку Telegram на
  // сторінці немає взагалі, і в базу за станом не ходимо.
  if (!telegramEnabled()) return { telegram: null }

  // Сам id чату назовні не йде — лише «підключено чи ні».
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { telegramChatId: true },
  })
  const linked = !!me?.telegramChatId

  return {
    telegram: {
      linked,
      // Посилання з токеном живе 15 хв — тому воно свіже на кожне
      // завантаження, а сторінка перезавантажує дані, коли людина
      // повертається з Telegram (див. +page.svelte).
      linkUrl: linked ? null : await telegramLinkUrl(user.id),
    },
  }
}
