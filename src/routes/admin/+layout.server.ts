import { requireStaffNoStepUp } from '$lib/server/admin/guard'
import { isVerified } from '$lib/server/admin/step-up'
import { adminQueues } from '$lib/server/admin/metrics'
import type { LayoutServerLoad } from './$types'

// Лейаут адмінки. Замок №1 (adminGate у hooks) сюди вже пропустив лише
// співробітника; тут — замок №2. Без введеного коду (сторінка /admin/2fa)
// меню й лічильників немає: нічого з адмінки до коду не показуємо.
export const load: LayoutServerLoad = async ({ locals }) => {
  const staff = await requireStaffNoStepUp(locals)
  const verified = isVerified(staff.sessionId)

  return {
    staff: {
      role: staff.role,
      name: locals.user?.name ?? null,
      email: locals.user?.email ?? '',
      onSite: staff.onboarded,
    },
    verified,
    queues: verified ? await adminQueues() : null,
  }
}
