import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from './helpers/prisma-mock'
import { safeTrigger, resetInfra } from './helpers/infra'
import { NOTIFICATION_TYPES, linkFor } from '$lib/notifications/types'
import type { Notification } from '$lib/notifications/types'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('./helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/pusher', async () => await import('./helpers/infra'))

const { notify, Notify } = await import('$lib/server/notifications')

// Сповіщення — це два записи одних даних: рядок у БД (його побачить той,
// хто зайде на сторінку) і подія Pusher (її побачить той, хто вже сидить у
// вкладці). Розійдуться вони мовчки — жодна помилка не спрацює, просто
// бейдж не оновиться. Тому тут звіряються саме СТИКИ:
//
//   • канал і назва події — рядками-літералами, не константами з мока
//     (розсинхрон 'notification' проти 'notification:new' уже був);
//   • тип кожного сповіщення є у списку, який знає клієнт;
//   • у кожного сповіщення є поле, по якому linkFor доведе кудись, крім
//     загальної стрічки.

const CREATED = {
  id: 'ntf-1',
  isRead: false,
  createdAt: new Date('2026-03-15T12:00:00Z'),
}

/** Аргументи create з останнього виклику. */
const createdData = () => prisma.notification.create.mock.calls[0][0].data

beforeEach(() => {
  resetPrisma()
  resetInfra()
  prisma.notification.create.mockResolvedValue(CREATED)
})

describe('notify(): запис і broadcast', () => {
  it('створює рядок рівно з переданими полями', async () => {
    await notify({
      userId: 'u-1',
      type: 'NEW_JOB',
      title: 'Є нова заявка',
      body: 'Прибирання',
      jobId: 'job-1',
    })

    expect(createdData()).toMatchObject({
      userId: 'u-1',
      type: 'NEW_JOB',
      title: 'Є нова заявка',
      body: 'Прибирання',
      jobId: 'job-1',
    })
  })

  it('шле подію в особистий канал отримувача', async () => {
    await notify({ userId: 'u-42', type: 'NEW_JOB', title: 'x' })

    const [channel] = safeTrigger.mock.calls[0]
    expect(channel).toBe('private-user-u-42')
  })

  // Ім'я події звіряється з рядком, а не з константою з мока: інакше
  // перейменування на сервері «підтвердилось» би тестом, а фронт
  // мовчки перестав би оновлюватись.
  it('назва події — notification:new', async () => {
    await notify({ userId: 'u-1', type: 'NEW_JOB', title: 'x' })

    expect(safeTrigger.mock.calls[0][1]).toBe('notification:new')
  })

  // Клієнт читає з події і jobId, і orderId — тому їде весь запис, а не
  // урізаний DTO.
  it('у події їде створений запис цілком', async () => {
    await notify({ userId: 'u-1', type: 'NEW_JOB', title: 'x' })

    expect(safeTrigger.mock.calls[0][2]).toEqual({ notification: CREATED })
  })

  it('спершу запис у БД, потім подія', async () => {
    await notify({ userId: 'u-1', type: 'NEW_JOB', title: 'x' })

    expect(prisma.notification.create.mock.invocationCallOrder[0]).toBeLessThan(
      safeTrigger.mock.invocationCallOrder[0],
    )
  })

  // Якщо запис не ліг — події бути не повинно: інакше в чужій вкладці
  // спалахне сповіщення, якого немає в стрічці й не буде після F5.
  it('падіння запису не породжує фантомної події', async () => {
    prisma.notification.create.mockRejectedValue(new Error('db down'))

    await expect(
      notify({ userId: 'u-1', type: 'NEW_JOB', title: 'x' }),
    ).rejects.toThrow()
    expect(safeTrigger).not.toHaveBeenCalled()
  })

  it('необов’язкові поля лишаються порожніми, а не рядком', async () => {
    await notify({ userId: 'u-1', type: 'ORDER_STARTED', title: 'x' })

    const data = createdData()
    for (const key of ['body', 'jobId', 'proposalId', 'orderId', 'chatId']) {
      expect(data[key]).toBeUndefined()
    }
  })
})

describe('notify(): транзакційного клієнта немає навмисно', () => {
  it('пише завжди через звичайний клієнт', async () => {
    await notify({ userId: 'u-1', type: 'NEW_JOB', title: 'x' })

    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
  })

  // Раніше функція приймала другим аргументом tx. Ним ніхто не
  // користувався, зате це були заряджені граблі: подія Pusher летить
  // одразу після create, тож усередині транзакції вона пішла б ДО коміту —
  // відкотилась, а у вкладці вже спалахнуло сповіщення про замовлення,
  // якого в базі немає. Тепер такого параметра просто немає, і сповіщати
  // можна лише після коміту (див. accept/+server.ts).
  it('другого аргументу в сигнатурі немає', () => {
    expect(notify.length).toBe(1)
  })

  it('зайвий аргумент нічого не змінює — пишемо туди ж', async () => {
    const tx = { notification: { create: vi.fn(async () => CREATED) } }

    await (notify as (p: unknown, tx?: unknown) => Promise<void>)(
      { userId: 'u-1', type: 'NEW_JOB', title: 'x' },
      tx,
    )

    expect(tx.notification.create).not.toHaveBeenCalled()
    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────── Хелпери Notify.* ───────────────────

/** Прогін одного хелпера: повертає data, що поїхала в create. */
async function fire(run: () => Promise<void>) {
  prisma.notification.create.mockClear()
  safeTrigger.mockClear()
  await run()
  return prisma.notification.create.mock.calls[0][0].data as Record<
    string,
    string | undefined
  >
}

describe('адресація: кожен хелпер б’є в потрібного користувача', () => {
  it('NEW_JOB — майстру, з id заявки', async () => {
    const d = await fire(() => Notify.newJob('master-1', 'job-1', 'Прибирання'))

    expect(d).toMatchObject({
      userId: 'master-1',
      type: 'NEW_JOB',
      jobId: 'job-1',
      body: 'Прибирання',
    })
  })

  it('NEW_PROPOSAL — клієнту, з id заявки і відгуку', async () => {
    const d = await fire(() =>
      Notify.newProposal('client-1', 'job-1', 'prop-1'),
    )

    expect(d).toMatchObject({
      userId: 'client-1',
      type: 'NEW_PROPOSAL',
      jobId: 'job-1',
      proposalId: 'prop-1',
    })
  })

  it('PROPOSAL_ACCEPTED — майстру, з id замовлення', async () => {
    const d = await fire(() =>
      Notify.proposalAccepted('master-1', 'job-1', 'order-1'),
    )

    expect(d).toMatchObject({
      userId: 'master-1',
      type: 'PROPOSAL_ACCEPTED',
      orderId: 'order-1',
    })
  })

  it('ORDER_STARTED — клієнту', async () => {
    const d = await fire(() => Notify.orderStarted('client-1', 'order-1'))

    expect(d).toMatchObject({
      userId: 'client-1',
      type: 'ORDER_STARTED',
      orderId: 'order-1',
    })
  })

  it('ORDER_COMPLETED — клієнту, із запрошенням на відгук', async () => {
    const d = await fire(() => Notify.orderCompleted('client-1', 'order-1'))

    expect(d).toMatchObject({
      userId: 'client-1',
      type: 'ORDER_COMPLETED',
      orderId: 'order-1',
    })
    expect(d.body).toBeTruthy()
  })

  // Скасувати може будь-яка сторона, тож отримувач — параметр, а не роль.
  it('ORDER_CANCELLED — тому, кого передали, з причиною в тілі', async () => {
    const d = await fire(() =>
      Notify.orderCancelled('master-1', 'order-1', 'Клієнт передумав'),
    )

    expect(d).toMatchObject({
      userId: 'master-1',
      type: 'ORDER_CANCELLED',
      orderId: 'order-1',
      body: 'Клієнт передумав',
    })
  })

  it('ORDER_CANCELLED без причини не ламається', async () => {
    const d = await fire(() => Notify.orderCancelled('client-1', 'order-1'))

    expect(d.body).toBeUndefined()
  })

  it('JOB_REOPENED — клієнту, з id заявки', async () => {
    const d = await fire(() => Notify.jobReopened('client-1', 'job-1'))

    expect(d).toMatchObject({
      userId: 'client-1',
      type: 'JOB_REOPENED',
      jobId: 'job-1',
    })
  })
})

describe('контракт із клієнтом', () => {
  const ALL: Array<[string, () => Promise<void>]> = [
    ['newJob', () => Notify.newJob('u', 'job-1', 'Прибирання')],
    ['newProposal', () => Notify.newProposal('u', 'job-1', 'prop-1')],
    ['proposalAccepted', () => Notify.proposalAccepted('u', 'job-1', 'ord-1')],
    ['orderStarted', () => Notify.orderStarted('u', 'ord-1')],
    ['orderCompleted', () => Notify.orderCompleted('u', 'ord-1')],
    ['orderCancelled', () => Notify.orderCancelled('u', 'ord-1', 'причина')],
    ['jobReopened', () => Notify.jobReopened('u', 'job-1')],
  ]

  // NOTIFICATION_TYPES — список, за яким клієнт розкладає сповіщення по
  // вигляду. Новий тип на сервері без рядка в цьому списку не зламає нічого
  // помітного: він просто мовчки поїде в default-гілку тоста.
  it('кожен тип із сервера є у списку, який знає клієнт', async () => {
    for (const [, run] of ALL) {
      const d = await fire(run)
      expect(NOTIFICATION_TYPES).toContain(d.type)
    }
  })

  it('список клієнта не містить типів, яких сервер не створює', async () => {
    const produced = new Set<string>()
    for (const [, run] of ALL) produced.add((await fire(run)).type as string)

    expect([...NOTIFICATION_TYPES].sort()).toEqual([...produced].sort())
  })

  // Гілки по proposalId у linkFor немає навмисно (коментар у types.ts):
  // клієнта з неї вибивало на сторінку для майстрів. Тому в кожного
  // сповіщення має бути jobId, orderId або chatId.
  it('кожне сповіщення веде кудись конкретно, а не в загальну стрічку', async () => {
    for (const [name, run] of ALL) {
      const d = await fire(run)
      const link = linkFor({ ...d, isRead: false } as unknown as Notification)

      expect(link, name).not.toBe('/dashboard/notifications')
    }
  })

  it('заголовок є завжди — саме він показується в тості', async () => {
    for (const [name, run] of ALL) {
      const d = await fire(run)
      expect(d.title, name).toBeTruthy()
    }
  })

  // Тон із маніфесту: тепло й по-людськи, без канцеляриту.
  it('тексти не канцелярські', async () => {
    for (const [name, run] of ALL) {
      const d = await fire(run)
      const text = `${d.title} ${d.body ?? ''}`

      expect(text, name).not.toMatch(/Ваш запит|оброблюється|Дана заявка/i)
    }
  })
})
