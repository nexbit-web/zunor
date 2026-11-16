// * генерація заголовка заявки з metadata.
// * Поля адаптивні — залежать від типу послуги

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
  /** Приблизна площа зі слів клієнта, м². Основа обсягу (effort.ts). */
  areaM2?: number
  /**
   * Поправка асистента до обсягу: +1 / −1 за тим, чого немає в полях
   * («вітрини в ТЦ», «дуже брудно»). Нуль не зберігаємо.
   */
  effortAdjust?: -1 | 1
  // * житлові послуги
  rooms?: string
  floor?: number
  hasElevator?: string
  // * після ремонту
  trash?: string
  // * регулярне
  frequency?: string
  // * вікна
  windowsCount?: number
  windowSide?: string
  balcony?: string
  // * хімчистка
  items?: CleaningItem[]
}

/** Заголовок заявки: «Генеральне прибирання, квартира, 2 кімнати», «Хімчистка: диван, килим». */
export function generateTitle(meta: CleaningMetadata): string {
  const service = serviceLabel(meta.service)
  const premise = premiseLabel(meta.premise).toLowerCase()

  // * хімчистка — перелік предметів
  if (meta.service === 'sofa' && meta.items && meta.items.length > 0) {
    const names = meta.items.map((i) => itemLabel(i.type).toLowerCase())
    const unique = [...new Set(names)]
    return `Хімчистка: ${unique.join(', ')}`
  }

  // * вікна — кількість
  if (meta.service === 'windows' && meta.windowsCount) {
    return `${service}, ${premise}, ${meta.windowsCount} вікон`
  }

  // * житлові — кімнати
  if (meta.rooms) {
    return `${service}, ${premise}, ${roomLabel(meta.rooms).toLowerCase()}`
  }

  return `${service}, ${premise}`
}
