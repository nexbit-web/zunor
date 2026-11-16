// * перетворює Job.metadata у список характеристик для показу клієнту/майстру.
// * Адаптивно — поля залежать від послуги

import { pluralUk } from '$lib/utils/plural'
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
  resolveWhen,
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

/**
 * Характеристики заявки з metadata; [] — порожньо або не прибирання.
 * createdAt — для «today»/«tomorrow»: вони відносні до дня створення заявки.
 */
export function describeJob(
  metadata: unknown,
  createdAt?: string | Date,
): JobDetail[] {
  if (!metadata || typeof metadata !== 'object') return []

  const m = metadata as Record<string, unknown>
  const details: JobDetail[] = []

  // * помешкання
  if (m.premise) {
    details.push({
      label: 'Помешкання',
      value: premiseLabel(String(m.premise)),
      icon: 'Home',
    })
  }

  // * послуга
  if (m.service) {
    details.push({
      label: 'Послуга',
      value: serviceLabel(String(m.service)),
      icon: 'Sparkles',
    })
  }

  // * кімнати
  if (m.rooms) {
    details.push({
      label: 'Кімнат',
      value: roomLabel(String(m.rooms)),
      icon: 'DoorOpen',
    })
  }

  // * площа — зі слів клієнта, тому «≈»
  if (typeof m.areaM2 === 'number' && m.areaM2 > 0) {
    details.push({
      label: 'Площа',
      value: `≈ ${m.areaM2} м²`,
      icon: 'Ruler',
    })
  }

  // * частота (регулярне)
  if (m.frequency) {
    details.push({
      label: 'Періодичність',
      value: frequencyLabel(String(m.frequency)),
      icon: 'Repeat',
    })
  }

  // * сміття (після ремонту)
  if (m.trash) {
    details.push({
      label: 'Сміття',
      value: trashLabel(String(m.trash)),
      icon: 'Trash2',
    })
  }

  // * вікна
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

  // * поверх + ліфт
  if (m.floor != null) {
    details.push({
      label: 'Поверх',
      value: `${m.floor}-й поверх`,
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
  // * хімчистка: предмети — структурований список (назва + кількість)
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

  // * коли
  if (m.when) {
    const day = createdAt ? resolveWhen(m.when, createdAt) : null
    details.push({
      label: 'Коли',
      value: whenLabel(day ?? String(m.when)),
      icon: 'Calendar',
    })
  }

  return details
}
