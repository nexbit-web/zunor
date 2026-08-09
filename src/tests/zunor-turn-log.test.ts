import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import type { DsMessage, DsTool } from '$lib/server/zunor/deepseek'

// Логер ходу Zunor — інструмент розробника, і саме тому в нього найжорсткіші
// вимоги: він стоїть у гарячому шляху чату й нічого про себе не знає.
// Модуль сам формулює три контракти, і кожен тут перевіряється:
//
//   1. НІКОЛИ не роняє запит — жодна помилка запису не має долетіти до
//      клієнта. Впав диск чи скінчилось місце — хід усе одно завершується.
//   2. У проді — no-op: ані файлів, ані накопичення блоків у пам'яті.
//      Процес один і живе тижнями; логер, що «трохи» пише в проді, — це
//      і диск, і затримка на кожному ході.
//   3. Контекст через AsyncLocalStorage: паралельні ходи різних юзерів не
//      мають перемішатись в один файл.

const env = vi.hoisted(() => ({
  dev: false,
  browser: false,
  building: true,
  version: 'test',
}))

const fs = vi.hoisted(() => ({
  mkdir: vi.fn(async (_dir: string, _opts?: unknown) => undefined),
  writeFile: vi.fn(
    async (_file: string, _body: string, _enc?: string) => undefined,
  ),
}))

vi.mock('$app/environment', () => env)
vi.mock('node:fs/promises', () => fs)

const { turnLog, withTurnLog } = await import('$lib/server/zunor/turn-log')

// Логер сам пише в консоль (шлях до файла / помилку запису) — у прогоні
// це чистий шум, тож глушимо.
const log = vi.spyOn(console, 'log').mockImplementation(() => {})
const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})

afterAll(() => {
  log.mockRestore()
  errorLog.mockRestore()
})

const TOOL: DsTool = {
  type: 'function',
  function: {
    name: 'create_cleaning_job',
    description: 'Створити заявку',
    parameters: {
      properties: { premise: {}, service: {}, area: {}, address: {} },
      required: ['premise', 'service'],
    },
  },
}

const META = { userId: 'user-1', city: 'odesa' }

/** Вміст єдиного записаного файла. */
const written = () => fs.writeFile.mock.calls[0][1] as string
/** Шлях єдиного записаного файла. */
const writtenPath = () => fs.writeFile.mock.calls[0][0] as string

beforeEach(() => {
  fs.mkdir.mockReset()
  fs.mkdir.mockResolvedValue(undefined)
  fs.writeFile.mockReset()
  fs.writeFile.mockResolvedValue(undefined)
  log.mockClear()
  errorLog.mockClear()
  env.dev = false
})

describe('прод: повний no-op', () => {
  it('нічого не пише на диск', async () => {
    await withTurnLog(META, async () => {
      turnLog().setup({ service: 'cleaning', tool: TOOL })
      turnLog().request('перший', [{ role: 'user', content: 'привіт' }], false)
      turnLog().response({
        text: 'вітаю',
        toolCall: null,
        finishReason: 'stop',
        ms: 120,
      })
      turnLog().final({ kind: 'text' })
    })

    expect(fs.writeFile).not.toHaveBeenCalled()
    expect(fs.mkdir).not.toHaveBeenCalled()
  })

  it('повертає результат ходу як є', async () => {
    const result = await withTurnLog(META, async () => ({ kind: 'text' }))

    expect(result).toEqual({ kind: 'text' })
  })

  it('виняток із ходу проходить наскрізь, файла все одно немає', async () => {
    await expect(
      withTurnLog(META, async () => {
        throw new Error('deepseek 500')
      }),
    ).rejects.toThrow('deepseek 500')

    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  // Головна причина, чому виклики логера розсипані по agent.ts без жодного
  // `if`: поза контекстом і в проді це заглушка, яку безпечно кликати
  // звідки завгодно.
  it('turnLog() поза контекстом безпечний', () => {
    expect(() => {
      turnLog().note('десь у фолбеку')
      turnLog().validation(false, 'немає площі')
      turnLog().final(undefined)
    }).not.toThrow()
  })
})

describe('dev: файл ходу', () => {
  beforeEach(() => {
    env.dev = true
  })

  it('пише рівно один файл на хід, у теку за датою', async () => {
    await withTurnLog(META, async () => {
      turnLog().setup({ service: 'cleaning', tool: TOOL })
    })

    expect(fs.writeFile).toHaveBeenCalledTimes(1)
    expect(writtenPath()).toContain('.zunor-logs')
    expect(writtenPath()).toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(writtenPath()).toMatch(/\.md$/)
    expect(fs.mkdir).toHaveBeenCalledWith(expect.anything(), {
      recursive: true,
    })
  })

  it('послуга потрапляє в ім’я файла — логи легко відсіювати', async () => {
    await withTurnLog(META, async () => {
      turnLog().setup({ service: 'windows', tool: TOOL })
    })

    expect(writtenPath()).toContain('windows')
  })

  it('без детекту послуги ім’я не ламається', async () => {
    await withTurnLog(META, async () => {
      turnLog().setup({ service: null, tool: TOOL })
    })

    expect(writtenPath()).toContain('no-service')
  })

  it('шапка містить користувача, місто й послугу', async () => {
    await withTurnLog(META, async () => {
      turnLog().setup({ service: 'cleaning', tool: TOOL })
    })

    const body = written()
    expect(body).toContain('user-1')
    expect(body).toContain('odesa')
    expect(body).toContain('cleaning')
  })

  it('без міста шапка теж пишеться', async () => {
    await withTurnLog({ userId: 'u', city: null }, async () => {
      turnLog().setup({ service: null, tool: TOOL })
    })

    expect(fs.writeFile).toHaveBeenCalledTimes(1)
  })

  // Найважливіший рядок логу: якщо в схемі при мийці вікон опинився
  // trash — баг знайдено, далі промпт можна не читати.
  it('поля схеми інструмента виписані окремим блоком', async () => {
    await withTurnLog(META, async () => {
      turnLog().setup({ service: 'cleaning', tool: TOOL })
    })

    const body = written()
    expect(body).toContain('Поля схеми інструмента')
    expect(body).toContain('premise')
    expect(body).toContain('обовʼязкові: premise, service')
  })

  it('інструмент без properties не роняє setup', async () => {
    const bare: DsTool = {
      type: 'function',
      function: { name: 'x', description: '', parameters: {} },
    }

    await withTurnLog(META, async () => {
      turnLog().setup({ service: null, tool: bare })
    })

    expect(written()).toContain('обовʼязкові: —')
  })
})

describe('dev: вміст блоків', () => {
  beforeEach(() => {
    env.dev = true
  })

  const history: DsMessage[] = [
    { role: 'system', content: 'СИСТЕМНИЙ ПРОМПТ ТУТ' },
    { role: 'user', content: 'треба прибрати квартиру' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'create_cleaning_job',
            arguments: '{"premise":"apartment"}',
          },
        },
      ],
    },
  ]

  it('системний промпт і історія розділені', async () => {
    await withTurnLog(META, async () => {
      turnLog().request('основний', history, true)
    })

    const body = written()
    expect(body).toContain('Системний промпт')
    expect(body).toContain('СИСТЕМНИЙ ПРОМПТ ТУТ')
    expect(body).toContain('Історія (2)')
    expect(body).toContain('треба прибрати квартиру')
  })

  it('видно, з thinking запит чи без', async () => {
    await withTurnLog(META, async () => {
      turnLog().request('основний', history, true)
      turnLog().request('ретрай', history, false)
    })

    expect(written()).toContain('thinking: on')
    expect(written()).toContain('thinking: off')
  })

  it('виклики нумеруються — видно, скільки разів ходили в модель', async () => {
    await withTurnLog(META, async () => {
      turnLog().request('a', history, false)
      turnLog().request('b', history, false)
      turnLog().request('c', history, false)
    })

    expect(written()).toContain('Виклик 3')
  })

  it('аргументи tool_call з історії видно', async () => {
    await withTurnLog(META, async () => {
      turnLog().request('основний', history, false)
    })

    expect(written()).toContain('apartment')
  })

  // Історія за 16 ходів у повному вигляді робить файл нечитабельним —
  // тому прев'ю зі зрізом.
  it('довге повідомлення зрізається з позначкою скільки лишилось', async () => {
    await withTurnLog(META, async () => {
      turnLog().request(
        'основний',
        [{ role: 'user', content: 'я'.repeat(1000) }],
        false,
      )
    })

    const body = written()
    expect(body).toContain('… (+600)')
    expect(body).not.toContain('я'.repeat(1000))
  })

  it('відповідь моделі містить час, finish_reason і токени', async () => {
    await withTurnLog(META, async () => {
      turnLog().response({
        text: 'Готово',
        toolCall: null,
        finishReason: 'stop',
        tokens: 512,
        ms: 2300,
      })
    })

    const body = written()
    expect(body).toContain('2.3s')
    expect(body).toContain('finish: stop')
    expect(body).toContain('tokens: 512')
    expect(body).toContain('Готово')
  })

  it('tool_call у відповіді розкладається читабельним JSON', async () => {
    await withTurnLog(META, async () => {
      turnLog().response({
        text: '',
        toolCall: {
          name: 'create_cleaning_job',
          arguments: '{"premise":"apartment","area":60}',
        },
        finishReason: 'tool_calls',
        ms: 900,
      })
    })

    const body = written()
    expect(body).toContain('tool_call: create_cleaning_job')
    expect(body).toContain('"premise": "apartment"')
  })

  // Биті arguments — це саме той випадок, заради якого лог і читають.
  it('битий JSON в аргументах показується як є, а не ковтається', async () => {
    await withTurnLog(META, async () => {
      turnLog().response({
        text: '',
        toolCall: { name: 'x', arguments: '{"premise": ' },
        finishReason: 'tool_calls',
        ms: 10,
      })
    })

    // Хвостовий пробіл зрізає fence() — важливо, що обірваний JSON узагалі
    // доїхав у файл, а не перетворився на порожній рядок.
    expect(written()).toContain('{"premise":')
  })

  it('результат валідації видно в обох варіантах', async () => {
    await withTurnLog(META, async () => {
      turnLog().validation(true)
      turnLog().validation(false, 'площа не вказана')
    })

    const body = written()
    expect(body).toContain('OK')
    expect(body).toContain('FAIL — площа не вказана')
  })

  it('фінал для клієнта пишеться окремим блоком', async () => {
    await withTurnLog(META, async () => {
      turnLog().final({ kind: 'text', message: 'Готово' })
    })

    const body = written()
    expect(body).toContain('Фінал (клієнту)')
    expect(body).toContain('"kind": "text"')
  })

  it('нотатки з гілок коду потрапляють у лог', async () => {
    await withTurnLog(META, async () => {
      turnLog().note('стрім обірвався, віддаю зібране')
    })

    expect(written()).toContain('стрім обірвався')
  })

  it('блоки йдуть у порядку виклику', async () => {
    await withTurnLog(META, async () => {
      turnLog().note('ПЕРШЕ')
      turnLog().validation(true)
      turnLog().note('ОСТАННЄ')
    })

    const body = written()
    expect(body.indexOf('ПЕРШЕ')).toBeLessThan(body.indexOf('ОСТАННЄ'))
  })
})

describe('dev: контракт «не роняти запит»', () => {
  beforeEach(() => {
    env.dev = true
  })

  // Диск заповнений, немає прав, антивірус тримає файл — хід усе одно
  // мусить віддати відповідь клієнту.
  it('помилка writeFile не долітає до клієнта', async () => {
    fs.writeFile.mockRejectedValue(new Error('ENOSPC'))

    const result = await withTurnLog(META, async () => ({ kind: 'text' }))

    expect(result).toEqual({ kind: 'text' })
    expect(errorLog).toHaveBeenCalled()
  })

  it('помилка mkdir теж проковтується', async () => {
    fs.mkdir.mockRejectedValue(new Error('EACCES'))

    await expect(withTurnLog(META, async () => 'ok')).resolves.toBe('ok')
  })

  // Лог потрібен саме тоді, коли хід упав, — інакше налагоджувати нічого.
  it('файл пишеться навіть коли хід кинув виняток', async () => {
    await expect(
      withTurnLog(META, async () => {
        turnLog().note('дійшли сюди')
        throw new Error('deepseek 500')
      }),
    ).rejects.toThrow('deepseek 500')

    expect(fs.writeFile).toHaveBeenCalledTimes(1)
    expect(written()).toContain('дійшли сюди')
  })

  it('нециклічний обʼєкт у final серіалізується, циклічний — не роняє', async () => {
    const circular: Record<string, unknown> = { kind: 'draft' }
    circular.self = circular

    await expect(
      withTurnLog(META, async () => {
        turnLog().final(circular)
      }),
    ).resolves.toBeUndefined()

    expect(fs.writeFile).toHaveBeenCalledTimes(1)
  })

  it('порожній хід без жодного виклику логера теж пише файл', async () => {
    await withTurnLog(META, async () => 'ok')

    expect(fs.writeFile).toHaveBeenCalledTimes(1)
    expect(written()).toContain('Zunor turn')
  })
})

describe('dev: ізоляція паралельних ходів', () => {
  beforeEach(() => {
    env.dev = true
  })

  // AsyncLocalStorage замість глобальної змінної саме заради цього: два
  // клієнти в чаті одночасно — звичайна ситуація, а не край.
  it('два ходи поруч не змішують блоки', async () => {
    await Promise.all([
      withTurnLog({ userId: 'клієнт-А', city: 'odesa' }, async () => {
        turnLog().note('МІТКА-А')
        await new Promise((r) => setTimeout(r, 5))
        turnLog().note('МІТКА-А-2')
      }),
      withTurnLog({ userId: 'клієнт-Б', city: 'kyiv' }, async () => {
        turnLog().note('МІТКА-Б')
        await new Promise((r) => setTimeout(r, 1))
        turnLog().note('МІТКА-Б-2')
      }),
    ])

    expect(fs.writeFile).toHaveBeenCalledTimes(2)

    const bodies = fs.writeFile.mock.calls.map((c) => c[1] as string)
    const a = bodies.find((b) => b.includes('клієнт-А'))!
    const b = bodies.find((b) => b.includes('клієнт-Б'))!

    expect(a).toContain('МІТКА-А-2')
    expect(a).not.toContain('МІТКА-Б')
    expect(b).toContain('МІТКА-Б-2')
    expect(b).not.toContain('МІТКА-А')
  })

  it('після виходу з ходу логер знову заглушка', async () => {
    await withTurnLog(META, async () => {
      turnLog().note('всередині')
    })
    fs.writeFile.mockClear()

    turnLog().note('зовні — нікуди')

    expect(fs.writeFile).not.toHaveBeenCalled()
  })
})
