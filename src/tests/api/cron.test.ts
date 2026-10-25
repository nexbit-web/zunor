import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import { resumeDispatch, resetInfra } from '../helpers/infra'
import { makeEvent, failure, okJson } from '../helpers/event'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('../helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/dispatch', async () => await import('../helpers/infra'))

const { GET } = await import('../../routes/api/cron/+server')

// Крон — єдиний ендпоінт без сесії: його авторизація тримається виключно на
// секреті в заголовку. Якщо він відкриється, будь-хто зможе крутити диспатч
// і будити базу — а Neon тарифікує ЧАС РОБОТИ обчислювача, тобто це прямі
// гроші, а не просто зайве навантаження.
//
// Секрет тут — з тестової заглушки $env (src/tests/mocks), не справжній.
const SECRET = 'test-cron-secret'

function cronEvent(auth?: string, task = 'all') {
  return makeEvent({
    method: 'GET',
    url: `/api/cron?task=${task}`,
    headers: auth ? { authorization: auth } : {},
  })
}

beforeEach(() => {
  resetPrisma()
  resetInfra()
  prisma.job.updateMany.mockResolvedValue({ count: 0 })
  prisma.job.findMany.mockResolvedValue([])
})

describe('авторизація', () => {
  it('без заголовка — 401', async () => {
    const res = await failure(() => GET(cronEvent()))
    expect(res.status).toBe(401)
    expect(prisma.job.updateMany).not.toHaveBeenCalled()
  })

  it('порожній Bearer — 401', async () => {
    expect((await failure(() => GET(cronEvent('Bearer ')))).status).toBe(401)
  })

  it('чужий секрет — 401', async () => {
    expect(
      (await failure(() => GET(cronEvent('Bearer wrong-secret')))).status,
    ).toBe(401)
  })

  it('секрет без префікса Bearer — 401', async () => {
    expect((await failure(() => GET(cronEvent(SECRET)))).status).toBe(401)
  })

  // Довший/коротший рядок відсікається до timingSafeEqual (він вимагає
  // однакової довжини) — перевіряємо, що це не падіння, а звичайна 401.
  it('секрет іншої довжини — 401, а не 500', async () => {
    expect(
      (await failure(() => GET(cronEvent(`Bearer ${SECRET}x`)))).status,
    ).toBe(401)
    expect(
      (await failure(() => GET(cronEvent(`Bearer ${SECRET.slice(0, -1)}`))))
        .status,
    ).toBe(401)
  })

  it('правильний секрет пускає', async () => {
    const body = await okJson<{ ok: boolean }>(() =>
      GET(cronEvent(`Bearer ${SECRET}`)),
    )
    expect(body.ok).toBe(true)
  })
})

describe('задачі', () => {
  const auth = `Bearer ${SECRET}`

  it('auto-expire закриває лише прострочені відкриті заявки', async () => {
    prisma.job.updateMany.mockResolvedValue({ count: 3 })

    const body = await okJson<{
      results: { task: string; affected: number }[]
    }>(() => GET(cronEvent(auth, 'auto-expire')))

    const where = prisma.job.updateMany.mock.calls[0][0].where
    expect(where.status).toBe('OPEN')
    expect(where.expiresAt.lte).toBeInstanceOf(Date)
    expect(body.results[0]).toMatchObject({ task: 'auto-expire', affected: 3 })
  })

  it('task=auto-expire не запускає хвилі', async () => {
    await GET(cronEvent(auth, 'auto-expire'))
    expect(resumeDispatch).not.toHaveBeenCalled()
  })

  // Крон — та сама страховка, що й старт процесу: одне відновлення, а не
  // окреме сканування, яке розійшлося б із ним правилами.
  it('dispatch-waves кличе відновлення розсилки й рахує наздогнані', async () => {
    resumeDispatch.mockResolvedValueOnce({ checked: 4, caughtUp: 2 })

    const body = await okJson<{ results: { affected: number }[] }>(() =>
      GET(cronEvent(auth, 'dispatch-waves')),
    )

    expect(resumeDispatch).toHaveBeenCalledTimes(1)
    expect(body.results[0].affected).toBe(2)
  })

  it('збій відновлення — ok:false з причиною, а не 500', async () => {
    resumeDispatch.mockRejectedValueOnce(new Error('neon timeout'))

    const body = await okJson<{ ok: boolean; results: { error?: string }[] }>(
      () => GET(cronEvent(auth, 'dispatch-waves')),
    )
    expect(body.ok).toBe(false)
    expect(body.results[0].error).toContain('neon timeout')
  })

  it('падіння бази повертає ok:false, а не 500', async () => {
    prisma.job.updateMany.mockRejectedValue(new Error('connection lost'))

    const body = await okJson<{ ok: boolean; results: { error?: string }[] }>(
      () => GET(cronEvent(auth, 'auto-expire')),
    )

    expect(body.ok).toBe(false)
    expect(body.results[0].error).toContain('connection lost')
  })
})
