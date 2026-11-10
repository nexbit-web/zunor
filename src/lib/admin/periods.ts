// Періоди метрик адмінки — спільні для сервера (metrics.ts) і сторінки
// (перемикач): сторінка не може імпортувати $lib/server.

export const PERIODS = { '7d': 7, '30d': 30, '90d': 90 } as const
export type Period = keyof typeof PERIODS

export const PERIOD_LABEL: Record<Period, string> = {
  '7d': '7 днів',
  '30d': '30 днів',
  '90d': '90 днів',
}
