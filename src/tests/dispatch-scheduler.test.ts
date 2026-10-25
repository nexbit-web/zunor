import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DISPATCH_CONFIG } from '$lib/server/dispatch/config'
import type { DispatchResult } from '$lib/server/dispatch/types'

const dispatchJob = vi.fn(
  async (_jobId: string): Promise<DispatchResult> => WAVE_DONE,
)

vi.mock('$lib/server/dispatch/dispatch', () => ({ dispatchJob }))

const { startWaves, scheduleWaves, cancelWaves, scheduledCount, runWave } =
  await import('$lib/server/dispatch/scheduler')

// Планувальник — швидкий шлях хвиль. Тести стежать за трьома речами:
//
//   • хвиля стартує рівно від createdAt заявки — і для нової, і для
//     підхопленої після рестарту;
//   • збій хвилі повторюється, а не губиться;
//   • таймери знімаються, щойно заявка не приймає відгуків, і жоден запис
//     не лишається в Map назавжди — процес один і живе тижнями.

const WAVE_DONE: DispatchResult = {
  kind: 'wave',
  wave: 1,
  notified: 0,
  lastCall: false,
}
const MIN = 60_000
const NOW = new Date('2026-10-25T12:00:00Z')
const { WAVES, RETRY_DELAYS_SEC } = DISPATCH_CONFIG
const DELAYED = WAVES.filter((w) => w.afterMinutes > 0)
const LAST_AT = WAVES.at(-1)!.afterMinutes * MIN

const fresh = (id = 'job-1') => ({ id, createdAt: new Date(Date.now()) })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  dispatchJob.mockReset()
  dispatchJob.mockResolvedValue(WAVE_DONE)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  // Map живе в модулі й спільна на весь файл.
  for (const id of ['job-1', 'job-2']) cancelWaves(id)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('розклад від createdAt', () => {
  it('нова заявка: перша хвиля одразу, решта — у свій час', async () => {
    await startWaves(fresh())
    expect(dispatchJob).toHaveBeenCalledTimes(1)

    for (const w of DELAYED) {
      await vi.advanceTimersToNextTimerAsync()
      expect(Date.now() - NOW.getTime()).toBe(w.afterMinutes * MIN)
    }
    expect(dispatchJob).toHaveBeenCalledTimes(1 + DELAYED.length)
  })

  it('хвиля не стартує раніше свого часу', async () => {
    scheduleWaves(fresh())

    await vi.advanceTimersByTimeAsync(DELAYED[0].afterMinutes * MIN - 1000)
    expect(dispatchJob).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2000)
    expect(dispatchJob).toHaveBeenCalledWith('job-1')
  })

  // Після рестарту заявці вже кілька хвилин: таймери ставляться лише на
  // хвилі, що попереду, і рахуються від її createdAt, а не від «зараз».
  it('стара заявка — лише хвилі, що попереду, у правильний момент', async () => {
    const createdAt = new Date(NOW.getTime() - 3 * MIN)
    scheduleWaves({ id: 'job-1', createdAt })

    const ahead = DELAYED.filter((w) => w.afterMinutes * MIN > 3 * MIN)
    await vi.runAllTimersAsync()
    expect(dispatchJob).toHaveBeenCalledTimes(ahead.length)
    expect(Date.now() - createdAt.getTime()).toBe(LAST_AT)
  })

  it('усі хвилі позаду — таймерів немає і заявка не під наглядом', () => {
    scheduleWaves({
      id: 'job-1',
      createdAt: new Date(NOW.getTime() - 60 * MIN),
    })
    expect(scheduledCount()).toBe(0)
  })

  it('повторне планування тієї ж заявки нічого не дублює', async () => {
    scheduleWaves(fresh())
    scheduleWaves(fresh())

    await vi.runAllTimersAsync()
    expect(dispatchJob).toHaveBeenCalledTimes(DELAYED.length)
  })

  it('різні заявки плануються незалежно', () => {
    scheduleWaves(fresh('job-1'))
    scheduleWaves(fresh('job-2'))
    expect(scheduledCount()).toBe(2)
  })
})

describe('повтори при збої', () => {
  it('упала хвиля — повтор за розкладом RETRY_DELAYS_SEC', async () => {
    dispatchJob.mockRejectedValueOnce(new Error('neon timeout'))

    await runWave('job-1')
    expect(dispatchJob).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_SEC[0] * 1000 - 1)
    expect(dispatchJob).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(dispatchJob).toHaveBeenCalledTimes(2)
  })

  it('повтори скінчились — здаємось, далі хвилю підбере відновлення', async () => {
    dispatchJob.mockRejectedValue(new Error('neon down'))

    await runWave('job-1')
    await vi.runAllTimersAsync()

    expect(dispatchJob).toHaveBeenCalledTimes(1 + RETRY_DELAYS_SEC.length)
    expect(scheduledCount()).toBe(0)
  })

  it('runWave не кидає — збій не валить того, хто кликав', async () => {
    dispatchJob.mockRejectedValue(new Error('boom'))
    await expect(runWave('job-1')).resolves.toBeUndefined()
  })

  it('перша хвиля нової заявки теж повторюється', async () => {
    dispatchJob.mockRejectedValueOnce(new Error('neon timeout'))

    await startWaves(fresh())
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_SEC[0] * 1000)
    expect(dispatchJob).toHaveBeenCalledTimes(2)
  })
})

describe('зупинка й скасування', () => {
  it('заявку закрили — решта хвиль знімається сама', async () => {
    dispatchJob.mockResolvedValue({ kind: 'stop', reason: 'job-closed' })

    await startWaves(fresh())
    expect(scheduledCount()).toBe(0)

    await vi.runAllTimersAsync()
    expect(dispatchJob).toHaveBeenCalledTimes(1)
  })

  it('досить відгуків — теж', async () => {
    scheduleWaves(fresh())
    dispatchJob.mockResolvedValue({ kind: 'stop', reason: 'enough-proposals' })

    await vi.advanceTimersByTimeAsync(DELAYED[0].afterMinutes * MIN)
    expect(scheduledCount()).toBe(0)
  })

  // Порожня хвиля — не привід зупинятись: майстри можуть зареєструватись
  // між хвилями.
  it('нікого не покликали — наступні хвилі лишаються', async () => {
    scheduleWaves(fresh())

    await vi.advanceTimersByTimeAsync(DELAYED[0].afterMinutes * MIN)
    expect(scheduledCount()).toBe(1)
  })

  it('cancelWaves знімає і хвилі, і повтори', async () => {
    dispatchJob.mockRejectedValueOnce(new Error('neon timeout'))
    await startWaves(fresh())

    cancelWaves('job-1')
    await vi.runAllTimersAsync()

    expect(dispatchJob).toHaveBeenCalledTimes(1)
    expect(scheduledCount()).toBe(0)
  })

  it('скасування однієї заявки не чіпає сусідню', async () => {
    scheduleWaves(fresh('job-1'))
    scheduleWaves(fresh('job-2'))

    cancelWaves('job-1')
    await vi.runAllTimersAsync()

    expect(dispatchJob).toHaveBeenCalledWith('job-2')
    expect(dispatchJob).not.toHaveBeenCalledWith('job-1')
  })

  it('скасування невідомої заявки нічого не ламає', () => {
    expect(() => cancelWaves('немає-такої')).not.toThrow()
  })

  it('після останньої хвилі запис зникає з Map', async () => {
    await startWaves(fresh())
    await vi.runAllTimersAsync()
    expect(scheduledCount()).toBe(0)
  })
})
