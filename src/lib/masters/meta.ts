// Що майстер розповів про себе для підбору.
//
// Спільне для будь-якої категорії — авто й формат роботи — це колонки
// MasterProfile (hasVehicle, crew, companyName) з типами в базі. Уміння в
// межах категорії («які прибирання робите») — контент категорії, тож
// лежать у MasterProfile.metadata.skills: нова категорія принесе свої
// (AGENTS.md, «Движок vs контент»).
//
// Модуль чистий і спільний для форми та сервера: форма показує ті самі
// відповіді, які сервер потім читає в розсилці.

/**
 * Формат роботи — дзеркало enum CrewType у schema.prisma. null у профілі —
 * не відповідав (профіль старший за питання): підбір тоді не дає ні
 * переваги, ні штрафу.
 */
export type Crew = 'SOLO' | 'TEAM' | 'COMPANY'

export function isCrew(v: unknown): v is Crew {
  return v === 'SOLO' || v === 'TEAM' || v === 'COMPANY'
}

export const COMPANY_NAME_MAX = 80

/**
 * Уміння за категоріями з MasterProfile.metadata: { [Category.slug]: дані
 * контент-шару }. Битий JSON — порожньо, не падіння.
 */
export function parseMasterSkills(raw: unknown): Record<string, unknown> {
  const m =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return m.skills && typeof m.skills === 'object' && !Array.isArray(m.skills)
    ? (m.skills as Record<string, unknown>)
    : {}
}

/** Як дістатися на замовлення — варіанти для форми. */
export const VEHICLE_OPTIONS = [
  {
    value: true,
    label: 'Своїм авто',
    hint: 'Покличемо й на дальші заявки та ті, де треба вивезти сміття',
  },
  {
    value: false,
    label: 'Громадським транспортом',
    hint: 'Пропонуватимемо заявки ближче до вас',
  },
] as const

/**
 * Формат роботи. Підказки — правда про підбір: від формату й обсягу
 * заявки залежить, хто йде першим (dispatch/core/score.ts, crewFit).
 */
export const CREW_OPTIONS = [
  {
    value: 'SOLO',
    label: 'Сам(а)',
    hint: 'Квартири й невеликі прибирання йтимуть вам першими',
  },
  {
    value: 'TEAM',
    label: 'З напарником або бригадою',
    hint: 'Великі квартири, будинки, прибирання після ремонту',
  },
  {
    value: 'COMPANY',
    label: 'Клінінгова компанія',
    hint: 'Офіси, комерція й найбільші обʼєкти — вам першим',
  },
] as const satisfies readonly { value: Crew; label: string; hint: string }[]

export function vehicleLabel(v: boolean | null): string {
  return VEHICLE_OPTIONS.find((o) => o.value === v)?.label ?? ''
}

export function crewLabel(v: Crew | null): string {
  return CREW_OPTIONS.find((o) => o.value === v)?.label ?? ''
}
