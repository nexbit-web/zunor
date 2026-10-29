// Уміння майстра в прибиранні і як вони зіставляються з заявкою.
//
// Майстер, який миє лише вікна, не має отримувати генеральні прибирання:
// для нього це спам, через який майстри йдуть, а для клієнта — хвиля
// розсилки, витрачена на людей, які не відгукнуться. Тому «які прибирання
// робите» і «де» — жорсткий фільтр, такий самий, як категорія.
//
// Контент категорії: движок розсилки не знає слів «хімчистка» чи
// «сміття». Він отримує звідси умови на Job.metadata і два прапорці —
// «потрібне авто» і «великий обʼєкт» (categories/matching.ts).

import { SERVICES } from './presets'

export const PREMISE_GROUPS = [
  {
    key: 'home',
    label: 'Квартири й будинки',
    hint: 'Житло: квартири, будинки, дачі',
    premises: ['apartment', 'house'],
  },
  {
    key: 'business',
    label: 'Офіси й комерція',
    hint: 'Офіси, магазини, салони, кафе',
    premises: ['office', 'commercial'],
  },
] as const

export type PremiseGroup = (typeof PREMISE_GROUPS)[number]['key']

/** Що входить у послугу — підказка під назвою у формі майстра. */
export const SERVICE_HINTS: Record<string, string> = {
  standard: 'Пил, підлоги, кухня, санвузол',
  deep: 'До дрібниць: техніка, шафи, плитка',
  'post-renovation': 'Будівельний пил, фарба, сміття',
  windows: 'Вікна, балкони, вітрини',
  sofa: 'Дивани, крісла, матраци, килими',
  regular: 'Постійні клієнти за графіком',
}

export interface CleaningSkills {
  /** Ключі SERVICES, які майстер робить. */
  services: string[]
  premises: PremiseGroup[]
}

const SERVICE_KEYS: readonly string[] = SERVICES.map((s) => s.key)
const GROUP_KEYS: readonly string[] = PREMISE_GROUPS.map((g) => g.key)

function pick(raw: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(raw)) return []
  // Порядок довідника, без дублів і сміття з клієнта.
  return allowed.filter((k) => raw.includes(k))
}

/**
 * Читання з бази: що є — те й беремо. null — майстер ще не відповідав
 * (профіль старший за питання): такого не відсіюємо ні від чого.
 */
export function parseCleaningSkills(raw: unknown): CleaningSkills | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const services = pick(r.services, SERVICE_KEYS)
  const premises = pick(r.premises, GROUP_KEYS) as PremiseGroup[]
  if (services.length === 0 && premises.length === 0) return null
  return { services, premises }
}

/** Запис із форми: обидва переліки обовʼязкові. */
export function validateCleaningSkills(
  raw: unknown,
): { ok: true; value: CleaningSkills } | { ok: false; error: string } {
  const r =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const services = pick(r.services, SERVICE_KEYS)
  const premises = pick(r.premises, GROUP_KEYS) as PremiseGroup[]
  if (services.length === 0) {
    return { ok: false, error: 'Оберіть, які прибирання ви робите' }
  }
  if (premises.length === 0) {
    return { ok: false, error: 'Оберіть, де готові прибирати' }
  }
  return { ok: true, value: { services, premises } }
}

/** Умова на одне поле Job.metadata: значення має бути одним із anyOf. */
export interface JobCondition {
  readonly field: string
  readonly anyOf: readonly string[]
}

/**
 * Умови, за якими заявка прибирання підходить майстру. [] — підходить
 * будь-яка (майстер ще не відповідав). «Інше» помешкання не відсіюємо
 * ні в кого: заздалегідь не скажеш, житло це чи ні.
 */
export function cleaningConditions(
  skills: CleaningSkills | null,
): JobCondition[] {
  if (!skills) return []
  const conditions: JobCondition[] = []
  if (skills.services.length > 0) {
    conditions.push({ field: 'service', anyOf: skills.services })
  }
  if (skills.premises.length > 0) {
    const premises = PREMISE_GROUPS.filter((g) =>
      skills.premises.includes(g.key),
    ).flatMap((g) => g.premises)
    conditions.push({ field: 'premise', anyOf: [...premises, 'other'] })
  }
  return conditions
}

const meta = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

/**
 * Будівельне сміття треба вивезти — без авто майстер або тягне його
 * маршруткою, або відмовляється на місці.
 */
export function cleaningNeedsVehicle(jobMetadata: unknown): boolean {
  return meta(jobMetadata).trash === 'needs-removal'
}
