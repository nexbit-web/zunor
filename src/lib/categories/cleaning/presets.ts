// src/lib/categories/cleaning/presets.ts
//
// Контент категорії "Прибирання". Чисті дані, без логіки.
// Рушій універсальний — щоб додати сантехніку, копіюємо папку й міняємо вміст.
//
// Структура заявки (Job.metadata) для прибирання:
//   { premise: string, service: string, size?: string, when: string }

export const CATEGORY_SLUG = 'prybyrannya'

// ─── Крок 1: Тип помешкання ───
export interface PremiseOption {
  key: string
  label: string
  icon: string // назва Lucide-іконки
}

export const PREMISES: PremiseOption[] = [
  { key: 'apartment', label: 'Квартира', icon: 'Building2' },
  { key: 'house', label: 'Дім', icon: 'Home' },
  { key: 'office', label: 'Офіс', icon: 'Briefcase' },
  { key: 'other', label: 'Інше', icon: 'Boxes' },
]

// ─── Крок 2: Тип прибирання ───
export interface ServiceOption {
  key: string
  label: string
  icon: string
}

export const SERVICES: ServiceOption[] = [
  { key: 'standard', label: 'Звичайне', icon: 'Sparkle' },
  { key: 'deep', label: 'Генеральне', icon: 'Sparkles' },
  { key: 'post-renovation', label: 'Після ремонту', icon: 'Hammer' },
  { key: 'windows', label: 'Миття вікон', icon: 'GlassWater' },
  { key: 'sofa', label: 'Хімчистка', icon: 'Sofa' },
  { key: 'regular', label: 'Регулярне', icon: 'Repeat' },
]

// ─── Крок 3: Розмір (залежить від помешкання) ───
export interface SizeOption {
  key: string
  label: string
}

// Для квартири/дому — кількість кімнат.
export const ROOM_SIZES: SizeOption[] = [
  { key: '1', label: '1 кімната' },
  { key: '2', label: '2 кімнати' },
  { key: '3', label: '3 кімнати' },
  { key: '4plus', label: '4+ кімнати' },
]

// Для офісу — площа.
export const AREA_SIZES: SizeOption[] = [
  { key: 'small', label: 'до 50 м²' },
  { key: 'medium', label: '50–100 м²' },
  { key: 'large', label: '100+ м²' },
]

/** Які розміри показувати для типу помешкання. Null = крок розміру пропускаємо. */
export function sizeOptionsFor(premise: string): SizeOption[] | null {
  if (premise === 'apartment' || premise === 'house') return ROOM_SIZES
  if (premise === 'office') return AREA_SIZES
  return null // "інше" — без розміру
}

// ─── Крок 4: Коли ───
export interface WhenOption {
  key: string
  label: string
}

export const WHEN_OPTIONS: WhenOption[] = [
  { key: 'today', label: 'Сьогодні' },
  { key: 'tomorrow', label: 'Завтра' },
  { key: 'custom', label: 'Інша дата' },
]

// ─── Хелпери пошуку label за key (для title-gen і превью) ───
export function premiseLabel(key: string): string {
  return PREMISES.find((p) => p.key === key)?.label ?? key
}

export function serviceLabel(key: string): string {
  return SERVICES.find((s) => s.key === key)?.label ?? key
}

export function sizeLabel(premise: string, key: string): string {
  const opts = sizeOptionsFor(premise)
  return opts?.find((o) => o.key === key)?.label ?? key
}

export function whenLabel(key: string): string {
  return WHEN_OPTIONS.find((w) => w.key === key)?.label ?? key
}
