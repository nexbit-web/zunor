import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DISPATCH_CONFIG } from '$lib/server/dispatch/types'

const dispatchJob = vi.fn(
  async (_jobId: string, _title: string) =>
    ({ notified: 0, wave: 1 }) as {
      notified: number
      wave: number
      stopped?: string
    },
)

vi.mock('$lib/server/dispatch/index', () => ({ dispatchJob }))

const { scheduleWaves, cancelWaves, scheduledCount } =
  await import('$lib/server/dispatch/scheduler')

// Планувальник хвиль у пам'яті процесу. Це не оптимізація «на смак»: крон
// раз на хвилину не давав Neon заснути ніколи й випалював місячну квоту за
// тиждень при НУЛЬОВОМУ трафіку. Тому тести стежать за двома речами:
//
//   • таймери справді знімаються, коли заявка більше не приймає відгуки —
//     інакше вони прокидаються й будять базу даремно (це прямі гроші);
//   • жодна гілка не лишає запис у Map назавжди — процес один і живе
//     тижнями, витік тут накопичується без кінця.

const JOB = 'job-1'

/** Скільки хвиль планується таймерами (перша йде синхронно при створенні). */
const DELAYED_WAVES = DISPATCH_CONFIG.WAVES.filter((w) => w.afterMinutes > 0)

beforeEach(() => {
  vi.useFakeTimers()
  dispatchJob.mockReset()
  dispatchJob.mockResolvedValue({ notified: 0, wave: 1 })
})

afterEach(() => {
  // Прибираємо за собою: Map живе в модулі й спільна на весь файл.
  cancelWaves(JOB)
  cancelWaves('job-2')
  vi.useRealTimers()
})

describe('планування', () => {
  it('ставить таймер на кожну відкладену хвилю', async () => {
    scheduleWaves(JOB, 'Прибирання')
    expect(scheduledCount()).toBe(1)

    // Перша хвиля — синхронна, планувальник її не чіпає.
    await vi.advanceTimersByTimeAsync(0)
    expect(dispatchJob).not.toHaveBeenCalled()

    for (const wave of DELAYED_WAVES) {
      await vi.advanceTimersByTimeAsync(wave.afterMinutes * 60_000)
    }
    expect(dispatchJob).toHaveBeenCalledTimes(DELAYED_WAVES.length)
  })

  it('хвиля будить диспетчер саме в свій час, не раніше', async () => {
    scheduleWaves(JOB, 'Прибирання')

    const first = DELAYED_WAVES[0].afterMinutes * 60_000
    await vi.advanceTimersByTimeAsync(first - 1000)
    expect(dispatchJob).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2000)
    expect(dispatchJob).toHaveBeenCalledWith(JOB, 'Прибирання')
  })

  // Захист від подвійного планування: /api/jobs викликає scheduleWaves один
  // раз, але страхувальний крон може дійти до тієї ж заявки.
  it('повторне планування тієї ж заявки ігнорується', async () => {
    scheduleWaves(JOB, 'Прибирання')
    scheduleWaves(JOB, 'Прибирання')
    scheduleWaves(JOB, 'Інша назва')

    expect(scheduledCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(dispatchJob).toHaveBeenCalledTimes(DELAYED_WAVES.length)
  })

  it('різні заявки плануються незалежно', async () => {
    scheduleWaves(JOB, 'Перша')
    scheduleWaves('job-2', 'Друга')

    expect(scheduledCount()).toBe(2)
  })
})

describe('скасування', () => {
  // Викликається з DELETE /api/jobs/[id] і з accept пропозиції. Забудеш —
  // і таймер розбудить базу заради заявки, для якої decide() однаково
  // поверне 'job-closed'.
  it('скасування знімає всі таймери заявки', async () => {
    scheduleWaves(JOB, 'Прибирання')
    cancelWaves(JOB)

    expect(scheduledCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(dispatchJob).not.toHaveBeenCalled()
  })

  it('скасування невідомої заявки нічого не ламає', () => {
    expect(() => cancelWaves('немає-такої')).not.toThrow()
    expect(scheduledCount()).toBe(0)
  })

  it('скасування однієї заявки не чіпає сусідню', async () => {
    scheduleWaves(JOB, 'Перша')
    scheduleWaves('job-2', 'Друга')

    cancelWaves(JOB)
    expect(scheduledCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(dispatchJob).toHaveBeenCalledWith('job-2', 'Друга')
    expect(dispatchJob).not.toHaveBeenCalledWith(JOB, 'Перша')
  })
})

describe('самоочищення', () => {
  // Заявка закрилась або набрала відгуків — решту хвиль знімаємо самі,
  // не чекаючи, поки хтось покличе cancelWaves.
  it('job-closed знімає решту хвиль', async () => {
    dispatchJob.mockResolvedValue({
      notified: 0,
      wave: 2,
      stopped: 'job-closed',
    })
    scheduleWaves(JOB, 'Прибирання')

    await vi.advanceTimersByTimeAsync(DELAYED_WAVES[0].afterMinutes * 60_000)

    expect(scheduledCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(dispatchJob).toHaveBeenCalledTimes(1)
  })

  it('enough-proposals теж знімає решту', async () => {
    dispatchJob.mockResolvedValue({
      notified: 0,
      wave: 2,
      stopped: 'enough-proposals',
    })
    scheduleWaves(JOB, 'Прибирання')

    await vi.advanceTimersByTimeAsync(DELAYED_WAVES[0].afterMinutes * 60_000)
    expect(scheduledCount()).toBe(0)
  })

  // А от 'no-candidates' — не привід зупинятись: майстри можуть
  // зареєструватись між хвилями, і саме заради них хвиля 3 «всі решта».
  it('no-candidates НЕ скасовує наступні хвилі', async () => {
    dispatchJob.mockResolvedValue({
      notified: 0,
      wave: 2,
      stopped: 'no-candidates',
    })
    scheduleWaves(JOB, 'Прибирання')

    await vi.advanceTimersByTimeAsync(DELAYED_WAVES[0].afterMinutes * 60_000)
    expect(scheduledCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(dispatchJob).toHaveBeenCalledTimes(DELAYED_WAVES.length)
  })

  it('після останньої хвилі запис зникає з Map', async () => {
    scheduleWaves(JOB, 'Прибирання')

    await vi.advanceTimersByTimeAsync(60 * 60_000)

    expect(dispatchJob).toHaveBeenCalledTimes(DELAYED_WAVES.length)
    expect(scheduledCount()).toBe(0)
  })

  // Падіння диспетчера (Neon відвалився) не має лишати заявку в Map
  // назавжди і не має зривати наступні хвилі.
  it('падіння диспетчера не ламає планувальник', async () => {
    dispatchJob.mockRejectedValue(new Error('neon timeout'))
    scheduleWaves(JOB, 'Прибирання')

    await vi.advanceTimersByTimeAsync(60 * 60_000)

    expect(dispatchJob).toHaveBeenCalledTimes(DELAYED_WAVES.length)
    expect(scheduledCount()).toBe(0)
  })
})
