// Ролі співробітників і що кому можна — одне місце для сервера (гарди
// /admin) і розмітки (які розділи показати в меню). Перенесено з CRM, де
// ієрархія вже була: ADMIN ≥ MANAGER ≥ MODERATOR.
//
//   MODERATOR — анкети майстрів і скарги;
//   MANAGER   — те саме + користувачі (бан) і метрики;
//   ADMIN     — усе + співробітники й журнал дій.

export type StaffRole = 'ADMIN' | 'MANAGER' | 'MODERATOR'

export const STAFF_ROLES: readonly StaffRole[] = ['ADMIN', 'MANAGER', 'MODERATOR']

const RANK: Record<StaffRole, number> = { MODERATOR: 1, MANAGER: 2, ADMIN: 3 }

export function isStaff(role: string | null | undefined): role is StaffRole {
  return role === 'ADMIN' || role === 'MANAGER' || role === 'MODERATOR'
}

/** Роль не нижча за потрібну. */
export function atLeast(role: string | null | undefined, min: StaffRole): boolean {
  return isStaff(role) && RANK[role] >= RANK[min]
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  ADMIN: 'Адміністратор',
  MANAGER: 'Менеджер',
  MODERATOR: 'Модератор',
}
