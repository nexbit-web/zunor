// TODO(legal): заповнити після реєстрації ФОП/ТОВ і погодження з юристом.
// Значення тут підставляються в обидва документи (/terms, /privacy).
// Поки поля порожні — тексти використовують нейтральне формулювання
// «Оператор Платформи Zunor», без вигаданих реквізитів.
export const COMPANY = {
  legalName: '', // напр. «ФОП Іванов Іван Іванович» або «ТОВ «Zunor»
  taxId: '', // ІПН фізособи-підприємця або ЄДРПОУ
  legalAddress: '', // юридична адреса
  supportEmail: 'support@zunor.org',
  privacyEmail: 'privacy@zunor.org',
  siteUrl: 'https://zunor.org',
} as const

export const LAST_UPDATED_TERMS = '2026-07-01'
export const LAST_UPDATED_PRIVACY = '2026-07-01'

/** Назва оператора для підстановки в текст; нейтральна, поки юрособа не зареєстрована. */
export function operatorName(): string {
  return COMPANY.legalName || 'Оператор Платформи Zunor'
}

/** Реквізити одним рядком для розділу «Контакти»; порожньо, якщо ще не заповнено. */
export function operatorRequisites(): string | null {
  if (!COMPANY.legalName) return null
  const parts = [
    COMPANY.legalName,
    COMPANY.taxId && `код/ІПН ${COMPANY.taxId}`,
    COMPANY.legalAddress,
  ].filter(Boolean)
  return parts.join(', ')
}
