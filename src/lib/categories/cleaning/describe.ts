// src/lib/categories/cleaning/describe.ts
//
// Перетворює Job.metadata у список характеристик для показу клієнту/майстру.
// Адаптивно — поля залежать від послуги.

import {
  premiseLabel,
  serviceLabel,
  roomLabel,
  elevatorLabel,
  balconyLabel,
  windowSideLabel,
  trashLabel,
  frequencyLabel,
  whenLabel,
  itemLabel,
  itemVariantLabel,
} from './presets'

export interface JobDetailItem {
  name: string
  qty: number
}

export interface JobDetail {
  label: string
  value: string
  /** Назва Lucide-іконки для цього поля. */
  icon?: string
  /** Для хімчистки — структурований список предметів. */
  items?: JobDetailItem[]
}

// Українська плюралізація для числівників: pluralUk(3, 'вікно', 'вікна', 'вікон')
// → 'вікна'. Враховує 11–14 (завжди третя форма).
function pluralUk(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100
  if (mod100 >= 11 && mod100 <= 14) return many
  const mod10 = mod100 % 10
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

/**
 * Будує список характеристик заявки з metadata.
 * Повертає [] якщо metadata порожня або не з прибирання.
 */
export function describeJob(metadata: unknown): JobDetail[] {
  if (!metadata || typeof metadata !== 'object') return []

  const m = metadata as Record<string, unknown>
  const details: JobDetail[] = []

  // Помешкання
  if (m.premise) {
    details.push({
      label: 'Помешкання',
      value: premiseLabel(String(m.premise)),
      icon: 'Home',
    })
  }

  // Послуга
  if (m.service) {
    details.push({
      label: 'Послуга',
      value: serviceLabel(String(m.service)),
      icon: 'Sparkles',
    })
  }

  // Кімнати
  if (m.rooms) {
    details.push({
      label: 'Кімнат',
      value: roomLabel(String(m.rooms)),
      icon: 'DoorOpen',
    })
  }

  // Частота (регулярне)
  if (m.frequency) {
    details.push({
      label: 'Періодичність',
      value: frequencyLabel(String(m.frequency)),
      icon: 'Repeat',
    })
  }

  // Сміття (після ремонту)
  if (m.trash) {
    details.push({
      label: 'Сміття',
      value: trashLabel(String(m.trash)),
      icon: 'Trash2',
    })
  }

  // Вікна
  if (m.windowsCount) {
    const count = Number(m.windowsCount)
    details.push({
      label: 'Кількість вікон',
      value: `${count} ${pluralUk(count, 'вікно', 'вікна', 'вікон')}`,
      icon: 'AppWindow',
    })
  }
  if (m.windowSide) {
    details.push({
      label: 'Сторона миття',
      value: windowSideLabel(String(m.windowSide)),
      icon: 'ArrowLeftRight',
    })
  }
  if (m.balcony) {
    details.push({
      label: 'Балкон',
      value: balconyLabel(String(m.balcony)),
      icon: 'Columns2',
    })
  }

  // Поверх + ліфт
  if (m.floor != null) {
    details.push({
      label: 'Поверх',
      value: `${m.floor} поверх`,
      icon: 'Building',
    })
  }
  if (m.hasElevator) {
    details.push({
      label: 'Ліфт',
      value: elevatorLabel(String(m.hasElevator)),
      icon: 'ArrowUpDown',
    })
  }
  // Хімчистка: предмети — структурований список (назва + кількість)
  if (Array.isArray(m.items) && m.items.length > 0) {
    const list = m.items.map((it: unknown) => {
      const item = it as Record<string, unknown>
      const baseName = itemLabel(String(item.type))
      const variant = item.variant
        ? ` (${itemVariantLabel(String(item.type), String(item.variant))})`
        : ''
      return {
        name: `${baseName}${variant}`,
        qty: Number(item.qty) || 1,
      }
    })
    details.push({ label: 'Предмети', value: '', items: list })
  }

  // Коли
  if (m.when) {
    details.push({
      label: 'Коли',
      value: whenLabel(String(m.when)),
      icon: 'Calendar',
    })
  }

  return details
}
