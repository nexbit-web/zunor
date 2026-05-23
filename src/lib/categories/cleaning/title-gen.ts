// src/lib/categories/cleaning/title-gen.ts
//
// Генерація заголовка заявки з metadata. Використовується:
//   - на сервері при створенні Job (Job.title)
//   - у wizard для превью на кроці підтвердження
//
// Приклад: "Генеральне прибирання, 2 кімнати"

import {
  premiseLabel,
  serviceLabel,
  sizeLabel,
  type CATEGORY_SLUG,
} from './presets'

export interface CleaningMetadata {
  premise: string
  service: string
  size?: string
  when: string
}

/**
 * Будує людський заголовок заявки.
 * service + premise/size — без зайвих слів.
 */
export function generateTitle(meta: CleaningMetadata): string {
  const service = serviceLabel(meta.service)
  const premise = premiseLabel(meta.premise).toLowerCase()

  // Розмір, якщо є
  const size = meta.size ? sizeLabel(meta.premise, meta.size).toLowerCase() : ''

  if (size) {
    return `${service} прибирання, ${premise}, ${size}`
  }
  return `${service} прибирання, ${premise}`
}
