// Мок Prisma-клієнта для тестів API.
//
// Жоден тест не ходить у справжню базу: це юніт-тести роутів, і перевіряють
// вони ЛОГІКУ роуту (хто має доступ, що валідується, що записується), а не
// поведінку Postgres. Що саме поверне база — задає сам тест.
//
// Клієнт лінивий: будь-яке звернення `prisma.<model>.<method>` створює
// vi.fn() на льоту. Так мок не треба тримати синхронним зі схемою — нова
// модель у schema.prisma не вимагає правок тут.

import { vi, type Mock } from 'vitest'

type ModelMock = Record<string, Mock>

let models: Record<string, ModelMock> = {}

/**
 * Модель, у якої будь-який метод — це vi.fn(), створений при першому доступі.
 *
 * За замовчуванням метод повертає ПРОМІС, а не undefined: справжня Prisma
 * завжди повертає thenable, і код на кшталт `prisma.user.update(...).catch()`
 * (presence, fail-soft-гілки) інакше падає на рівному місці — не через баг у
 * коді, а через недоліплений мок.
 */
function modelProxy(): ModelMock {
  return new Proxy({} as ModelMock, {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined
      if (!target[prop]) target[prop] = vi.fn(async () => undefined)
      return target[prop]
    },
  })
}

/**
 * $transaction поводиться як справжня: масив промісів виконується разом,
 * колбек отримує той самий клієнт. Тести, які перевіряють вміст транзакції,
 * бачать ті самі виклики, що й поза нею.
 */
function makeTransaction(): Mock {
  return vi.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => unknown)(prisma)
    }
    return Promise.all(arg as Promise<unknown>[])
  })
}

let transaction = makeTransaction()

/**
 * Службові методи клієнта ($executeRaw, $queryRaw). Диспетчер бере через
 * $executeRaw advisory-лок, і без цієї гілки проксі віддав би на нього
 * обʼєкт-модель замість функції — виклик tagged template впав би на рівному
 * місці.
 */
let rawMethods: Record<string, Mock> = {}

// `any` тут свідомий: мок не має типів схеми, а тест пише
// `prisma.job.findUnique.mockResolvedValue(...)` — це не продакшн-код.
// eslint-правил у проєкті немає, svelte-check явний any пропускає.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma: any = new Proxy({} as Record<string, unknown>, {
  get(_target, prop) {
    if (typeof prop !== 'string') return undefined
    if (prop === '$transaction') return transaction
    if (prop.startsWith('$')) {
      if (!rawMethods[prop]) rawMethods[prop] = vi.fn(async () => undefined)
      return rawMethods[prop]
    }
    if (!models[prop]) models[prop] = modelProxy()
    return models[prop]
  },
})

/** Викликати в beforeEach: інакше моки течуть із тесту в тест. */
export function resetPrisma(): void {
  models = {}
  rawMethods = {}
  transaction = makeTransaction()
}
