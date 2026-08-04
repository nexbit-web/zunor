import { redirect } from '@sveltejs/kit'
import { prisma } from '$lib/server/prisma'
import { requireUser } from '$lib/server/guards'
import {
  parseAiProfile,
  ABOUT_MAX,
  OBJECT_NOTE_MAX,
  MAX_OBJECTS,
} from '$lib/server/zunor/ai-profile'
import { PREMISES, SERVICES } from '$lib/categories/cleaning/presets'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const user = requireUser(locals, '/dashboard/settings/assistant')

  // Другий рубіж після фільтра в рейці: прямий перехід за URL
  // майстра сюди не пустить.
  if (locals.account?.role !== 'CLIENT')
    redirect(303, '/dashboard/settings/appearance')

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { aiProfile: true, name: true },
  })

  return {
    profile: parseAiProfile(me?.aiProfile),
    userName: me?.name ?? '',
    premises: PREMISES,
    services: SERVICES,
    limits: {
      about: ABOUT_MAX,
      objectNote: OBJECT_NOTE_MAX,
      maxObjects: MAX_OBJECTS,
    },
  }
}
