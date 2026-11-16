// * замків адмінки два: adminGate у hooks.server.ts на все під /admin і
// * requireStaff у кожному load/action — з мінімальною роллю для дії. Роль —
// * з бази, не з сесії. Чужому — 404: ззовні не видно, що адмінка існує

import { error } from '@sveltejs/kit'
import { getAccountState } from '../account-cache'
import { atLeast, isStaff, type StaffRole } from '$lib/admin/roles'
import { isVerified } from './step-up'

export interface Staff {
  id: string
  role: StaffRole
  sessionId: string
  /** Є анкета на сайті. Без неї /dashboard веде назад в адмінку (hooks),
   *  тож «На сайт» такому співробітнику не показуємо — лише «Вийти». */
  onboarded: boolean
}

/** Співробітник (будь-яка роль), БЕЗ перевірки другого фактора. */
export async function staffOf(locals: App.Locals): Promise<Staff | null> {
  const s = locals.session
  if (!s) return null
  const account = await getAccountState(s.user.id)
  if (!account || account.banned || !isStaff(account.role)) return null
  return { id: account.id, role: account.role, sessionId: s.session.id, onboarded: account.onboarded }
}

/**
 * Для сторінок налаштування й введення коду: співробітник, другий фактор
 * ще не обовʼязковий. Не співробітник — 404.
 */
export async function requireStaffNoStepUp(locals: App.Locals): Promise<Staff> {
  const staff = await staffOf(locals)
  if (!staff) error(404, 'Not found')
  return staff
}

/** Для всього іншого в адмінці: співробітник із введеним кодом і роллю не нижче `min`. */
export async function requireStaff(
  locals: App.Locals,
  min: StaffRole = 'MODERATOR',
): Promise<Staff> {
  const staff = await requireStaffNoStepUp(locals)
  if (!(await isVerified(staff.sessionId))) error(404, 'Not found')
  if (!atLeast(staff.role, min)) error(404, 'Not found')
  return staff
}
