// Райони для тестів — ті самі, що кладе в БД prisma/seed-districts.ts.
//
// Код бере їх через getDistricts() із кешу довідників. У тестах мокаємо
// саме його, а не prisma.district: кеш живе в модулі й пережив би
// resetPrisma(), тож перший тест файлу вирішував би за всі наступні.

import { vi } from 'vitest'
import { DISTRICTS } from '../../../prisma/data/districts'
import type { RefDistrict } from '$lib/server/reference'

export const getDistricts = vi.fn(
  async (): Promise<RefDistrict[]> => DISTRICTS.map((d) => ({ ...d })),
)
