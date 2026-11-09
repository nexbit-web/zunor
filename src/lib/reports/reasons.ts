// Причини скарги — закритий набір, спільний для браузера (діалог
// «Поскаржитися») і сервера (POST /api/reports приймає лише ці ключі).
// Як набір реакцій у чаті: вільний текст замість причини модератор не
// відсортував би, а список зі спільного файлу не розійдеться між боками.
//
// Ключі пишуться в базу (Report.reason) і читаються CRM: перейменовувати
// не можна, лише додавати. Підпис міняти можна.

export type ReportReason =
  | 'no_show'
  | 'quality'
  | 'rude'
  | 'payment'
  | 'fake'
  | 'other'

export interface ReasonOption {
  key: ReportReason
  label: string
  /** Лише на майстра: «погано прибрав» про клієнта не має сенсу. */
  onlyMaster?: true
}

export const REPORT_REASONS: readonly ReasonOption[] = [
  { key: 'no_show', label: 'Не прийшов або зірвав домовленість' },
  { key: 'quality', label: 'Погано виконана робота', onlyMaster: true },
  { key: 'rude', label: 'Грубість, образи чи погрози' },
  { key: 'payment', label: 'Вимагає передоплату чи більше грошей' },
  { key: 'fake', label: 'Фейковий профіль чи заявка' },
  { key: 'other', label: 'Інше' },
]

/** Причини, доречні для того, на кого скаржаться. */
export function reasonsFor(
  targetRole: 'MASTER' | 'CLIENT',
): readonly ReasonOption[] {
  return REPORT_REASONS.filter((r) => !r.onlyMaster || targetRole === 'MASTER')
}

export function isReportReason(value: unknown): value is ReportReason {
  return REPORT_REASONS.some((r) => r.key === value)
}

/** «Інше» без пояснення модератор не розбере. */
export const OTHER_MIN_LENGTH = 10
export const TEXT_MAX_LENGTH = 1000
