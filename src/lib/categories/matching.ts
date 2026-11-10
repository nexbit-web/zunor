// Як категорія зіставляє заявку з майстром — міст між контентом і движком.
//
// Движок розсилки (server/dispatch) про прибирання нічого не знає: він
// питає тут, чи підходить майстер заявці (умови на Job.metadata), чи
// потрібне заявці авто і який у неї обсяг. Те саме з днем роботи для
// нагадувань (server/reminders) і з дублями заявок (server/job-duplicates).
// Нова категорія — новий запис у MATCHING; категорія без запису підходить
// усім, як і досі.

import { CATEGORY_SLUG, resolveWhen } from './cleaning/presets'
import { cleaningEffort } from './cleaning/effort'
import {
  cleaningConditions,
  cleaningNeedsVehicle,
  parseCleaningSkills,
  validateCleaningSkills,
  type JobCondition,
} from './cleaning/skills'

export type { JobCondition } from './cleaning/skills'

/** Перевірка умінь із форми: значення для запису або текст помилки. */
export type SkillsCheck =
  | { ok: true; value: unknown }
  | { ok: false; error: string }

export interface CategoryMatching {
  /**
   * Уміння з форми профілю. null — у категорії немає що питати, і в
   * MasterProfile.metadata для неї нічого не пишемо.
   */
  validateSkills(raw: unknown): SkillsCheck | null
  /** Умови на Job.metadata з умінь майстра; [] — підходить будь-яка заявка. */
  conditions(skills: unknown): JobCondition[]
  /** Заявці потрібне авто (вивезти сміття). */
  needsVehicle(jobMetadata: unknown): boolean
  /**
   * Обсяг роботи 1–10 ($lib/categories/effort). null — категорія його не
   * рахує: тоді формат роботи майстра на підбір не впливає.
   */
  effort(jobMetadata: unknown): number | null
  /**
   * День роботи — ISO-день за Києвом («YYYY-MM-DD»). createdAt — коли
   * створено ЗАЯВКУ: відносні «сьогодні/завтра» рахуються від неї. null —
   * дня немає (категорія без дати): тоді й нагадувати нема про що.
   */
  serviceDay(jobMetadata: unknown, createdAt: Date | string): string | null
  /**
   * Що робить дві заявки клієнта «тією самою» ($lib/server/job-duplicates):
   * однаковий ключ — попередження перед створенням другої. null — категорія
   * дублів не розпізнає, попередження не буде.
   */
  duplicateKey(jobMetadata: unknown): string | null
}

const OPEN: CategoryMatching = {
  validateSkills: () => null,
  conditions: () => [],
  needsVehicle: () => false,
  effort: () => null,
  serviceDay: () => null,
  duplicateKey: () => null,
}

const MATCHING: Record<string, CategoryMatching> = {
  [CATEGORY_SLUG]: {
    validateSkills: validateCleaningSkills,
    conditions: (skills) => cleaningConditions(parseCleaningSkills(skills)),
    needsVehicle: cleaningNeedsVehicle,
    effort: cleaningEffort,
    serviceDay: (meta, createdAt) =>
      resolveWhen((meta as { when?: unknown } | null)?.when, createdAt),
    // Та сама послуга — незалежно від дня: нова заявка замість зміненої
    // дати теж дубль. Приміщення не порівнюємо — асистент іноді називає
    // ту саму квартиру по-різному, а зайве питання коштує один клік.
    duplicateKey: (meta) => {
      const service = (meta as { service?: unknown } | null)?.service
      return typeof service === 'string' ? service : null
    },
  },
}

export function matchingFor(category: string): CategoryMatching {
  return MATCHING[category] ?? OPEN
}

/** Чи виконані умови на metadata заявки. */
export function meetsConditions(
  jobMetadata: unknown,
  conditions: readonly JobCondition[],
): boolean {
  const m =
    jobMetadata && typeof jobMetadata === 'object'
      ? (jobMetadata as Record<string, unknown>)
      : {}
  return conditions.every((c) => {
    const value = m[c.field]
    return typeof value === 'string' && c.anyOf.includes(value)
  })
}
