// src/lib/categories/cleaning/validate.ts
//
// Валідація metadata на сервері. Поля перевіряються залежно від послуги.

import {
  PREMISES,
  SERVICES,
  QUICK_WHEN,
  ROOM_OPTIONS,
  ELEVATOR_OPTIONS,
  BALCONY_OPTIONS,
  TRASH_OPTIONS,
  FREQUENCY_OPTIONS,
  SOFA_ITEMS,
  needsRooms,
  needsWindows,
  needsItems,
  needsFrequency,
  needsTrash,
} from './presets'
import type { CleaningMetadata, CleaningItem } from './title-gen'

export interface ValidationResult {
  ok: boolean
  error?: string
  clean?: CleaningMetadata
}

/** Перевіряє, що when — це 'today'/'tomorrow' або валідна майбутня ISO-дата. */
function validateWhen(when: string): boolean {
  if (QUICK_WHEN.some((w) => w.key === when)) return true
  const d = new Date(when)
  if (isNaN(d.getTime())) return false
  // не раніше сьогодні (з допуском на час)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d.getTime() >= today.getTime()
}

export function validateCleaningMetadata(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Некоректні дані заявки' }
  }

  const m = raw as Record<string, unknown>

  const premise = String(m.premise ?? '')
  const service = String(m.service ?? '')
  const when = String(m.when ?? '')

  if (!PREMISES.some((p) => p.key === premise)) {
    return { ok: false, error: 'Оберіть тип помешкання' }
  }
  if (!SERVICES.some((s) => s.key === service)) {
    return { ok: false, error: 'Оберіть тип прибирання' }
  }
  if (!validateWhen(when)) {
    return { ok: false, error: 'Оберіть коректну дату' }
  }

  const clean: CleaningMetadata = { premise, service, when }

  // ─── Житлові послуги: кімнати + поверх + ліфт ───
  if (needsRooms(service)) {
    const rooms = String(m.rooms ?? '')
    if (!ROOM_OPTIONS.some((o) => o.key === rooms)) {
      return { ok: false, error: 'Оберіть кількість кімнат' }
    }
    clean.rooms = rooms

    // Поверх — опціонально, але якщо є — число
    if (m.floor != null && m.floor !== '') {
      const floor = Number(m.floor)
      if (Number.isInteger(floor) && floor >= 0 && floor <= 200) {
        clean.floor = floor
      }
    }
    // Ліфт — опціонально
    const elev = String(m.hasElevator ?? '')
    if (ELEVATOR_OPTIONS.some((o) => o.key === elev)) {
      clean.hasElevator = elev
    }
  }

  // ─── Після ремонту: сміття ───
  if (needsTrash(service)) {
    const trash = String(m.trash ?? '')
    if (TRASH_OPTIONS.some((o) => o.key === trash)) {
      clean.trash = trash
    }
  }

  // ─── Регулярне: частота ───
  if (needsFrequency(service)) {
    const freq = String(m.frequency ?? '')
    if (!FREQUENCY_OPTIONS.some((o) => o.key === freq)) {
      return { ok: false, error: 'Оберіть частоту прибирання' }
    }
    clean.frequency = freq
  }

  // ─── Вікна: кількість + поверх + балкон ───
  if (needsWindows(service)) {
    const count = Number(m.windowsCount)
    if (!Number.isInteger(count) || count < 1 || count > 200) {
      return { ok: false, error: 'Вкажіть кількість вікон' }
    }
    clean.windowsCount = count

    if (m.floor != null && m.floor !== '') {
      const floor = Number(m.floor)
      if (Number.isInteger(floor) && floor >= 0 && floor <= 200) {
        clean.floor = floor
      }
    }
    const balcony = String(m.balcony ?? '')
    if (BALCONY_OPTIONS.some((o) => o.key === balcony)) {
      clean.balcony = balcony
    }
  }

  // ─── Хімчистка: предмети ───
  if (needsItems(service)) {
    const rawItems = Array.isArray(m.items) ? m.items : []
    const items: CleaningItem[] = []

    for (const ri of rawItems) {
      if (!ri || typeof ri !== 'object') continue
      const it = ri as Record<string, unknown>
      const type = String(it.type ?? '')
      const def = SOFA_ITEMS.find((i) => i.key === type)
      if (!def) continue

      const qty = Number(it.qty)
      if (!Number.isInteger(qty) || qty < 1 || qty > 50) continue

      const item: CleaningItem = { type, qty }

      // варіант — якщо предмет його має
      if (def.variants) {
        const variant = String(it.variant ?? '')
        if (def.variants.some((v) => v.key === variant)) {
          item.variant = variant
        }
      }
      items.push(item)
    }

    if (items.length === 0) {
      return { ok: false, error: 'Оберіть хоча б один предмет' }
    }
    clean.items = items
  }

  return { ok: true, clean }
}
