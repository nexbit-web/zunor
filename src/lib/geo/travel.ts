// Як далеко майстер готовий їздити. Дальше цієї відстані заявки йому не
// надсилаються взагалі: людина, яка сказала «лише поруч», не має щоранку
// гортати заявки з іншого кінця міста — це спам, через який майстри йдуть.
//
// Варіанти фіксовані, а не повзунок: чотири зрозумілі відповіді швидше
// за точне число, а сервер приймає лише їх (MasterProfile.travelRadiusKm).

/** Допустимі радіуси, км. null — «будь-де», без обмеження. */
export const TRAVEL_RADII = [5, 10, 15] as const

export type TravelRadius = (typeof TRAVEL_RADII)[number] | null

export const TRAVEL_OPTIONS: readonly {
  value: TravelRadius
  label: string
  hint: string
}[] = [
  { value: 5, label: 'До 5 км', hint: 'Свій район і сусідні' },
  { value: 10, label: 'До 10 км', hint: 'Пів міста' },
  { value: 15, label: 'До 15 км', hint: 'Майже все місто' },
  { value: null, label: 'Будь-де', hint: 'Усе місто й передмістя' },
]

export function isTravelRadius(v: unknown): v is TravelRadius {
  return v === null || (TRAVEL_RADII as readonly unknown[]).includes(v)
}

export function travelLabel(v: number | null): string {
  return TRAVEL_OPTIONS.find((o) => o.value === v)?.label ?? 'Будь-де'
}
