// src/lib/categories/cleaning/validate.ts
//
// Валідація metadata заявки на сервері. Не довіряємо клієнту —
// перевіряємо, що premise/service/size/when з дозволених значень.

import { PREMISES, SERVICES, WHEN_OPTIONS, sizeOptionsFor } from './presets'
import type { CleaningMetadata } from './title-gen'

export interface ValidationResult {
  ok: boolean
  error?: string
  /** Очищена metadata (тільки дозволені поля). */
  clean?: CleaningMetadata
}

/**
 * Перевіряє сирий metadata з запиту.
 * Повертає очищений об'єкт або помилку.
 */
export function validateCleaningMetadata(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Некоректні дані заявки' }
  }

  const m = raw as Record<string, unknown>

  const premise = String(m.premise ?? '')
  const service = String(m.service ?? '')
  const when = String(m.when ?? '')
  const size = m.size != null ? String(m.size) : undefined

  // premise
  if (!PREMISES.some((p) => p.key === premise)) {
    return { ok: false, error: 'Оберіть тип помешкання' }
  }

  // service
  if (!SERVICES.some((s) => s.key === service)) {
    return { ok: false, error: 'Оберіть тип прибирання' }
  }

  // when
  if (!WHEN_OPTIONS.some((w) => w.key === when)) {
    return { ok: false, error: 'Оберіть час' }
  }

  // size — перевіряємо тільки якщо для цього premise він потрібен
  const sizeOpts = sizeOptionsFor(premise)
  let cleanSize: string | undefined = undefined
  if (sizeOpts) {
    if (size && sizeOpts.some((o) => o.key === size)) {
      cleanSize = size
    }
    // size необов'язковий — якщо не передали, просто пропускаємо
  }

  return {
    ok: true,
    clean: {
      premise,
      service,
      when,
      ...(cleanSize ? { size: cleanSize } : {}),
    },
  }
}
