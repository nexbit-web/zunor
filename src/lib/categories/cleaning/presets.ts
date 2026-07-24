// src/lib/categories/cleaning/presets.ts
//
// Контент категорії "Прибирання". Чисті дані, без логіки.
// Поля деталей (крок 3) адаптивні — залежать від типу послуги.

export const CATEGORY_SLUG = 'prybyrannya'

// ─── Крок 1: Тип помешкання ───
export interface PremiseOption {
  key: string
  label: string
  icon: string
}

export const PREMISES: PremiseOption[] = [
  { key: 'apartment', label: 'Квартира', icon: 'Building2' },
  { key: 'house', label: 'Дім', icon: 'Home' },
  { key: 'office', label: 'Офіс', icon: 'Briefcase' },
  { key: 'commercial', label: 'Комерційне', icon: 'Store' },
  { key: 'other', label: 'Інше', icon: 'Boxes' },
]

export function premiseLabel(key: string): string {
  return PREMISES.find((p) => p.key === key)?.label ?? key
}

// ─── Крок 2: Тип прибирання ───
export interface ServiceOption {
  key: string
  label: string
  icon: string
}

export const SERVICES = [
  { key: 'standard', label: 'Звичайне', icon: 'Sparkle' },
  { key: 'deep', label: 'Генеральне', icon: 'Sparkles' },
  { key: 'post-renovation', label: 'Після ремонту', icon: 'Hammer' },
  { key: 'windows', label: 'Миття вікон', icon: 'GlassWater' },
  { key: 'sofa', label: 'Хімчистка', icon: 'Sofa' },
  { key: 'regular', label: 'Регулярне', icon: 'Repeat' },
] as const satisfies readonly ServiceOption[]

export function serviceLabel(key: string): string {
  return SERVICES.find((s) => s.key === key)?.label ?? key
}

// ─── Крок 3: Деталі (адаптивні) ───
//
// Кожна послуга має свій набір полів. Тип поля визначає UI.

// Які послуги питають кімнати/поверх/ліфт (стандартний житловий блок)
const ROOM_BASED = ['standard', 'deep', 'post-renovation', 'regular']

export function needsRooms(service: string): boolean {
  return ROOM_BASED.includes(service)
}
export function needsWindows(service: string): boolean {
  return service === 'windows'
}
export function needsItems(service: string): boolean {
  return service === 'sofa'
}
export function needsFrequency(service: string): boolean {
  return service === 'regular'
}
export function needsTrash(service: string): boolean {
  return service === 'post-renovation'
}

// Кількість кімнат
export const ROOM_OPTIONS = [
  { key: '1', label: '1 кімната' },
  { key: '2', label: '2 кімнати' },
  { key: '3', label: '3 кімнати' },
  { key: '4plus', label: '4+ кімнати' },
]
export function roomLabel(key: string): string {
  return ROOM_OPTIONS.find((o) => o.key === key)?.label ?? key
}

// Ліфт
export const ELEVATOR_OPTIONS = [
  { key: 'yes', label: 'Є ліфт' },
  { key: 'no', label: 'Немає ліфта' },
]
export function elevatorLabel(key: string): string {
  return ELEVATOR_OPTIONS.find((o) => o.key === key)?.label ?? key
}

// Балкон (вікна: тип скління; генеральне прибирання квартири: чи прибирати балкон)
export const BALCONY_OPTIONS = [
  { key: 'none', label: 'Немає' },
  { key: 'standard', label: 'Звичайний' },
  { key: 'panoramic', label: 'Панорамний' },
]
export function balconyLabel(key: string): string {
  return BALCONY_OPTIONS.find((o) => o.key === key)?.label ?? key
}

// Сміття (для після ремонту)
export const TRASH_OPTIONS = [
  { key: 'removed', label: 'Сміття вже винесене' },
  { key: 'needs-removal', label: 'Потрібно винести сміття' },
]
export function trashLabel(key: string): string {
  return TRASH_OPTIONS.find((o) => o.key === key)?.label ?? key
}

// Частота (для регулярного)
export const FREQUENCY_OPTIONS = [
  { key: 'weekly', label: 'Раз на тиждень' },
  { key: 'biweekly', label: 'Раз на 2 тижні' },
  { key: 'monthly', label: 'Раз на місяць' },
]
export function frequencyLabel(key: string): string {
  return FREQUENCY_OPTIONS.find((o) => o.key === key)?.label ?? key
}

// ─── Хімчистка: предмети ───
export interface CleaningItemDef {
  key: string
  label: string
  /** Варіанти (наприклад розмір дивана). Якщо немає — просто кількість. */
  variants?: { key: string; label: string }[]
}

export const SOFA_ITEMS: CleaningItemDef[] = [
  {
    key: 'sofa',
    label: 'Диван',
    variants: [
      { key: '2', label: '2-місний' },
      { key: '3', label: '3-місний' },
      { key: 'corner', label: 'Кутовий' },
    ],
  },
  { key: 'armchair', label: 'Крісло' },
  {
    key: 'mattress',
    label: 'Матрац',
    variants: [
      { key: 'single', label: '1-спальний' },
      { key: 'double', label: '2-спальний' },
    ],
  },
  {
    key: 'carpet',
    label: 'Килим',
    variants: [
      { key: 'small', label: 'Малий' },
      { key: 'medium', label: 'Середній' },
      { key: 'large', label: 'Великий' },
    ],
  },
  { key: 'chairs', label: 'Стільці' },
]

export function itemLabel(key: string): string {
  return SOFA_ITEMS.find((i) => i.key === key)?.label ?? key
}
export function itemVariantLabel(itemKey: string, variantKey: string): string {
  const item = SOFA_ITEMS.find((i) => i.key === itemKey)
  return item?.variants?.find((v) => v.key === variantKey)?.label ?? variantKey
}

// ─── Крок 4: Коли ───
export const QUICK_WHEN = [
  { key: 'today', label: 'Сьогодні' },
  { key: 'tomorrow', label: 'Завтра' },
]
export function whenLabel(key: string): string {
  const q = QUICK_WHEN.find((w) => w.key === key)
  if (q) return q.label
  // інакше це ISO-дата
  const d = new Date(key)
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })
  }
  return key
}
