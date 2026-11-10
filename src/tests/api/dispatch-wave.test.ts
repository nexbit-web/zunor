import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeEvent, failure, okJson } from '../helpers/event'

// Черга хвиль (лише Vercel): QStash кличе POST /api/dispatch/wave у
// хвилину чергової хвилі. Ендпоінт без сесії, тож увесь захист — підпис
// QStash. Якщо він відкриється, будь-хто зможе смикати розсилку.

const { verifyWaveRequest, runQueuedWave } = vi.hoisted(() => ({
  verifyWaveRequest: vi.fn(async (_sig: string | null, _body: string) => false),
  runQueuedWave: vi.fn(async (_jobId: string) => ({
    kind: 'wave' as const,
    wave: 2,
    notified: 5,
    lastCall: false,
  })),
}))
vi.mock('$lib/server/dispatch', () => ({ verifyWaveRequest, runQueuedWave }))

const { POST } = await import('../../routes/api/dispatch/wave/+server')

function waveEvent(body: unknown, signature?: string) {
  return makeEvent({
    method: 'POST',
    url: '/api/dispatch/wave',
    body,
    headers: signature ? { 'upstash-signature': signature } : {},
  })
}

beforeEach(() => {
  verifyWaveRequest.mockReset()
  verifyWaveRequest.mockResolvedValue(false)
  runQueuedWave.mockClear()
})

describe('підпис QStash', () => {
  it('без підпису — 401, хвиля не запускається', async () => {
    const res = await failure(() => POST(waveEvent({ jobId: 'job-1' })))
    expect(res.status).toBe(401)
    expect(runQueuedWave).not.toHaveBeenCalled()
  })

  it('чужий підпис — 401', async () => {
    const res = await failure(() =>
      POST(waveEvent({ jobId: 'job-1' }, 'forged')),
    )
    expect(res.status).toBe(401)
    expect(runQueuedWave).not.toHaveBeenCalled()
  })

  // Підпис рахується від сирого тіла: перевіряти треба саме його, а не
  // JSON, перезібраний після розбору.
  it('у перевірку йде сирий підпис і сире тіло', async () => {
    verifyWaveRequest.mockResolvedValue(true)
    await POST(waveEvent({ jobId: 'job-1' }, 'sig-1'))
    expect(verifyWaveRequest).toHaveBeenCalledWith(
      'sig-1',
      JSON.stringify({ jobId: 'job-1' }),
    )
  })
})

describe('справжній виклик', () => {
  beforeEach(() => verifyWaveRequest.mockResolvedValue(true))

  it('запускає хвилю саме цієї заявки', async () => {
    const body = await okJson<{ ok: boolean }>(() =>
      POST(waveEvent({ jobId: 'job-42' }, 'sig')),
    )
    expect(body.ok).toBe(true)
    expect(runQueuedWave).toHaveBeenCalledWith('job-42')
  })

  it('без jobId чи зі сміттям — 400', async () => {
    for (const bad of [{}, { jobId: 42 }, { jobId: '' }, { jobId: 'x'.repeat(65) }]) {
      const res = await failure(() => POST(waveEvent(bad, 'sig')))
      expect(res.status).toBe(400)
    }
    expect(runQueuedWave).not.toHaveBeenCalled()
  })

  // Ковтати помилку не можна: тоді QStash вважав би хвилю виконаною й не
  // повторив би її.
  it('помилка хвилі летить назовні — QStash повторить', async () => {
    runQueuedWave.mockRejectedValueOnce(new Error('db down'))
    await expect(POST(waveEvent({ jobId: 'job-1' }, 'sig'))).rejects.toThrow(
      'db down',
    )
  })
})
