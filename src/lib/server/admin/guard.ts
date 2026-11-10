// Замки адмінки. Їх два, і це навмисно:
//
//   1. adminGate у hooks.server.ts — на ВСЕ під /admin і /api/admin ще
//      до коду сторінки: не співробітник (і гість) → 404, без другого
//      фактора → сторінка коду.
//   2. requireStaff у кожному load/action/ендпоінті — та сама перевірка
//      ще раз, плюс мінімальна роль для конкретної дії.
//
// Забули другий замок — тримає перший; зламався перший — тримає другий.
// Роль — з бази (account-cache), а не з сесії: cookie-кеш сесії живе
// 5 хв, і знята роль діяла б ще стільки ж. Чужому — 404, не 403: ззовні
// не видно навіть, що адмінка існує.

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
