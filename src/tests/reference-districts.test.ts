import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from './helpers/prisma-mock'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('./helpers/prisma-mock')).prisma,
}))

const { getDistricts, invalidateReference } =
  await import('$lib/server/reference')

// Райони читає розсилка на кожну хвилю, стрічка й профіль — на кожен вхід.
// Тому тут дві обіцянки: у код приходять лише живі райони живих міст, і
// база не будиться на кожен виклик.

const ROW = {
  citySlug: 'odesa',
  slug: 'center',
  name: 'Центр',
  group: 'CITY',
  latitude: 46.4843,
  longitude: 30.7357,
}

beforeEach(() => {
  resetPrisma()
  invalidateReference()
  prisma.district.findMany.mockResolvedValue([ROW])
})

describe('getDistricts', () => {
  it('бере лише активні райони активних міст', async () => {
    await getDistricts()

    const args = prisma.district.findMany.mock.calls[0][0]
    expect(args.where).toEqual({ isActive: true, city: { isActive: true } })
  })

  // Чисті функції $lib/geo працюють із lat/lng — назви колонок БД
  // (latitude/longitude) далі кешу не їдуть.
  it('віддає район у формі, яку читають гео-функції', async () => {
    expect(await getDistricts()).toEqual([
      {
        citySlug: 'odesa',
        slug: 'center',
        name: 'Центр',
        group: 'CITY',
        lat: 46.4843,
        lng: 30.7357,
      },
    ])
  })

  it('другий виклик — із кешу, без запиту до бази', async () => {
    await getDistricts()
    await getDistricts()
    expect(prisma.district.findMany).toHaveBeenCalledTimes(1)
  })

  it('одночасні виклики на холодному кеші — один запит', async () => {
    await Promise.all([getDistricts(), getDistricts(), getDistricts()])
    expect(prisma.district.findMany).toHaveBeenCalledTimes(1)
  })

  it('після скидання кешу — новий запит', async () => {
    await getDistricts()
    invalidateReference()
    await getDistricts()
    expect(prisma.district.findMany).toHaveBeenCalledTimes(2)
  })
})
