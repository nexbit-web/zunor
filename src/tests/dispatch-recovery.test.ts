import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from './helpers/prisma-mock'
import { DISPATCH_CONFIG } from '$lib/server/dispatch/config'
import { FINAL_WAVE } from '$lib/server/dispatch/core/waves'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('./helpers/prisma-mock')).prisma,
}))

const runWave = vi.fn(async (_jobId: string) => {})
const scheduleWaves = vi.fn(
  (_job: { id: string; createdAt: Date }, _now?: number) => {},
)
vi.mock('$lib/server/dispatch/scheduler', () => ({ runWave, scheduleWaves }))

const { resumeDispatch } = await import('$lib/server/dispatch/recovery')

// Відновлення — те, на чому тримається «сповіщення доходить завжди»:
// таймери живуть у памʼяті й гинуть із процесом, а номер відпрацьованої
// хвилі лежить у заявці. Тут перевіряється, що після рестарту кожна
// незавершена заявка отримує хвилю, яку пропустила, — і лише її.

const NOW = new Date('2026-10-25T12:00:00Z')
const MIN = 60_000

const pending = (id: string, ageMin: number, dispatchWave: number) => ({
  id,
  createdAt: new Date(NOW.getTime() - ageMin * MIN),
  dispatchWave,
})

beforeEach(() => {
  resetPrisma()
  runWave.mockClear()
  scheduleWaves.mockClear()
  prisma.job.findMany.mockResolvedValue([])
})

describe('що підбирає', () => {
  it('лише відкриті, живі, незавершені й ще без достатку відгуків', async () => {
    await resumeDispatch(NOW)

    const args = prisma.job.findMany.mock.calls[0][0]
    expect(args.where).toEqual({
      status: 'OPEN',
      expiresAt: { gt: NOW },
      dispatchWave: { lt: FINAL_WAVE },
      proposalsCount: { lt: DISPATCH_CONFIG.ENOUGH_PROPOSALS },
    })
  })

  // Після довгого простою заявок може бути багато — стеля, і першими
  // найстаріші: вони чекають найдовше.
  it('зі стелею і від найстаріших', async () => {
    await resumeDispatch(NOW)

    const args = prisma.job.findMany.mock.calls[0][0]
    expect(args.take).toBe(DISPATCH_CONFIG.RESUME_BATCH)
    expect(args.orderBy).toEqual({ createdAt: 'asc' })
  })
})

describe('що робить із кожною заявкою', () => {
  // Процес лежав, поки настала остання хвиля, — її запускаємо одразу.
  it('пропущена хвиля запускається зараз', async () => {
    prisma.job.findMany.mockResolvedValue([pending('late', 30, 1)])

    const report = await resumeDispatch(NOW)
    expect(runWave).toHaveBeenCalledWith('late')
    expect(report).toEqual({ checked: 1, caughtUp: 1 })
  })

  // Хвиля 2 вже відпрацювала, до третьої ще хвилина — кликати нічого,
  // лише поставити таймери на те, що попереду.
  it('нічого не пропущено — лише таймери на майбутні хвилі', async () => {
    prisma.job.findMany.mockResolvedValue([pending('on-time', 4, 2)])

    const report = await resumeDispatch(NOW)
    expect(runWave).not.toHaveBeenCalled()
    expect(scheduleWaves).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'on-time' }),
      NOW.getTime(),
    )
    expect(report).toEqual({ checked: 1, caughtUp: 0 })
  })

  it('заявка, якій не відпрацювала жодна хвиля, отримує першу', async () => {
    prisma.job.findMany.mockResolvedValue([pending('lost', 0.5, 0)])

    await resumeDispatch(NOW)
    expect(runWave).toHaveBeenCalledWith('lost')
  })

  it('кожна заявка береться під нагляд таймерів', async () => {
    prisma.job.findMany.mockResolvedValue([
      pending('a', 30, 1),
      pending('b', 4, 2),
    ])

    await resumeDispatch(NOW)
    expect(scheduleWaves).toHaveBeenCalledTimes(2)
  })

  // Базі щойно прокинутись — хвилі по черзі, а не всі разом.
  it('хвилі запускаються по одній', async () => {
    let inFlight = 0
    let peak = 0
    runWave.mockImplementation(async () => {
      peak = Math.max(peak, ++inFlight)
      await Promise.resolve()
      inFlight--
    })
    prisma.job.findMany.mockResolvedValue([
      pending('a', 30, 1),
      pending('b', 30, 1),
      pending('c', 30, 1),
    ])

    await resumeDispatch(NOW)
    expect(runWave).toHaveBeenCalledTimes(3)
    expect(peak).toBe(1)
  })
})
