// src/lib/categories/cleaning/title-gen.ts
//
// Генерація заголовка заявки з metadata.
// Поля адаптивні — залежать від типу послуги.

import {
  premiseLabel,
  serviceLabel,
  roomLabel,
  itemLabel,
  itemVariantLabel,
  whenLabel,
} from './presets'

/** Предмет хімчистки. */
export interface CleaningItem {
  type: string
  variant?: string
  qty: number
}

/** Гнучка metadata — поля залежать від послуги. */
export interface CleaningMetadata {
  premise: string
  service: string
  when: string
  // житлові послуги
  rooms?: string
  floor?: number
  hasElevator?: string
  // після ремонту
  trash?: string
  // регулярне
  frequency?: string
  // вікна
  windowsCount?: number
  balcony?: string
  // хімчистка
  items?: CleaningItem[]
}

/**
 * Будує людський заголовок заявки.
 * Приклади:
 *   "Генеральне прибирання, квартира, 2 кімнати"
 *   "Миття вікон, квартира, 5 вікон"
 *   "Хімчистка: диван, килим"
 */
export function generateTitle(meta: CleaningMetadata): string {
  const service = serviceLabel(meta.service)
  const premise = premiseLabel(meta.premise).toLowerCase()

  // Хімчистка — перелік предметів
  if (meta.service === 'sofa' && meta.items && meta.items.length > 0) {
    const names = meta.items.map((i) => itemLabel(i.type).toLowerCase())
    const unique = [...new Set(names)]
    return `Хімчистка: ${unique.join(', ')}`
  }

  // Вікна — кількість
  if (meta.service === 'windows' && meta.windowsCount) {
    return `${service}, ${premise}, ${meta.windowsCount} вікон`
  }

  // Житлові — кімнати
  if (meta.rooms) {
    return `${service}, ${premise}, ${roomLabel(meta.rooms).toLowerCase()}`
  }

  return `${service}, ${premise}`
}
