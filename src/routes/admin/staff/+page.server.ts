import { prisma } from '$lib/server/prisma'
import { requireStaff } from '$lib/server/admin/guard'
import { resetStaffTwoFactor, setStaffRole } from '$lib/server/admin/actions'
import { asForm, field } from '$lib/server/admin/form'
import { STAFF_ROLES, isStaff, type StaffRole } from '$lib/admin/roles'
import type { Actions, PageServerLoad } from './$types'

// Співробітники — лише для ADMIN. Ролі видаються існуючим акаунтам за
// поштою (людина спершу реєструється в Zunor звичайним шляхом), а не
// створюються тут із паролем: так у співробітника той самий захищений
// вхід, що й у всіх, і жодного пароля не проходить через чужі руки.
export const load: PageServerLoad = async ({ locals }) => {
  const me = await requireStaff(locals, 'ADMIN')

  const staff = await prisma.user.findMany({
    where: { role: { in: [...STAFF_ROLES] } },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      banned: true,
      staffTwoFactor: { select: { enabledAt: true } },
    },
  })

  return {
    meId: me.id,
    staff: staff.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      role: s.role as StaffRole,
      banned: s.banned,
      twoFactor: !!s.staffTwoFactor?.enabledAt,
    })),
  }
}

export const actions: Actions = {
  setRole: async (event) =>
    asForm(async () => {
      const me = await requireStaff(event.locals, 'ADMIN')
      const fd = await event.request.formData()
      const role = field(fd, 'role')
      await setStaffRole(
        event,
        me,
        field(fd, 'email'),
        role === 'NONE' ? null : isStaff(role) ? role : null,
      )
      return { ok: 'Збережено' }
    }),

  resetTwoFactor: async (event) =>
    asForm(async () => {
      const me = await requireStaff(event.locals, 'ADMIN')
      await resetStaffTwoFactor(event, me, field(await event.request.formData(), 'userId'))
      return { ok: 'Другий фактор скинуто — при вході співробітник налаштує його знову' }
    }),
}
