import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ZunorClientMessage } from '$lib/types/zunor'

// ─── Моки моделі ───

interface DsToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}
interface DsResponse {
  choices: Array<{
    message: {
      role: 'assistant'
      content: string | null
      tool_calls?: DsToolCall[]
    }
    finish_reason: string
  }>
}
type StreamChunk = { type: 'text'; delta: string } | { type: 'tool_start' }
interface StreamResult {
  content: string
  toolCall: DsToolCall | null
  finishReason: string | null
}

const chatCompletion = vi.fn(
  async (
    _messages: { role: string; content: string | null }[],
    _tools: unknown[],
    _thinking?: boolean,
  ): Promise<DsResponse> => textResponse('Привіт!'),
)

const chatCompletionStream = vi.fn(
  (
    _messages: { role: string; content: string | null }[],
    _tools: unknown[],
    _thinking?: boolean,
  ): AsyncGenerator<StreamChunk, StreamResult, void> =>
    makeStream([], { content: '', toolCall: null, finishReason: 'stop' }),
)

vi.mock('$lib/server/zunor/deepseek', () => ({
  chatCompletion,
  chatCompletionStream,
  ZUNOR_MODEL: 'test-model',
}))

// Логер ходу — суто діагностика, у тестах нас цікавить не він.
vi.mock('$lib/server/zunor/turn-log', () => {
  const logger = new Proxy({}, { get: () => vi.fn() })
  return {
    turnLog: () => logger,
    withTurnLog: async (_ctx: unknown, fn: () => Promise<void>) => fn(),
  }
})

const { runZunorTurn, runZunorTurnStream } =
  await import('$lib/server/zunor/agent')

/**
 * ZunorResponse — розмічене обʼєднання (message | draft), тож читати
 * suggestions чи draft без звуження компілятор не дає. Звуження на кожен
 * рядок було б шумом, який ховає саму перевірку, тому дивимось через один
 * широкий тип. Яка саме гілка прийшла, тест стверджує явно —
 * `expect(res.kind).toBe('draft')`.
 */
interface AnyResponse {
  kind: string
  reply: string
  suggestions?: string[]
  draft?: {
    metadata: Record<string, unknown>
    title: string
    description: string
    summary: unknown[]
  }
}

const turn = (...args: Parameters<typeof runZunorTurn>) =>
  runZunorTurn(...args) as Promise<AnyResponse>
const turnStream = (...args: Parameters<typeof runZunorTurnStream>) =>
  runZunorTurnStream(...args) as Promise<AnyResponse>

// Агент — єдине місце, де вивід LLM перетворюється на дані продукту. Модель
// недетермінована й регулярно порушує промпт (зривається в Markdown, зливає
// два кроки в один, віддає биті аргументи інструмента). Тому тут перевіряємо
// не «що сказала модель», а ПОСТОБРОБКУ: що з будь-якого її виводу вийде
// коректна відповідь клієнту або коректний драфт заявки.
//
// Промпт як текст покритий окремо (zunor-prompt.test.ts).

const TOOL_NAME = 'submit_job_draft'

function textResponse(content: string, finish = 'stop'): DsResponse {
  return {
    choices: [
      { message: { role: 'assistant', content }, finish_reason: finish },
    ],
  }
}

function toolResponse(args: unknown, content = ''): DsResponse {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: TOOL_NAME,
                arguments:
                  typeof args === 'string' ? args : JSON.stringify(args),
              },
            },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
  }
}

async function* makeStream(
  chunks: StreamChunk[],
  result: StreamResult,
): AsyncGenerator<StreamChunk, StreamResult, void> {
  for (const c of chunks) yield c
  return result
}

const validDraft = {
  premise: 'apartment',
  service: 'standard',
  when: 'today',
  rooms: '2',
}

function history(...contents: string[]): ZunorClientMessage[] {
  return contents.map((content, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content,
  }))
}

/** Системний промпт, який агент відправив у модель. */
function sentSystemPrompt(): string {
  const messages = chatCompletion.mock.calls[0][0]
  return messages[0].content ?? ''
}

beforeEach(() => {
  chatCompletion.mockReset()
  chatCompletionStream.mockReset()
  chatCompletion.mockResolvedValue(textResponse('Привіт!'))
})

describe('звичайна відповідь', () => {
  it('текст моделі стає повідомленням клієнту', async () => {
    chatCompletion.mockResolvedValue(textResponse('  Скільки кімнат?  '))

    const res = await turn(history('Треба прибрати'), 'odesa')
    expect(res).toEqual({ kind: 'message', reply: 'Скільки кімнат?' })
  })

  it('порожня відповідь без інструмента — модель штовхають ще раз', async () => {
    chatCompletion
      .mockResolvedValueOnce(textResponse(''))
      .mockResolvedValueOnce(textResponse('Скільки кімнат?'))

    const res = await turn(history('Треба прибрати'), 'odesa')
    expect(res.reply).toBe('Скільки кімнат?')
    expect(chatCompletion).toHaveBeenCalledTimes(2)
  })

  it('обрізана відповідь без інструмента — новий раунд, а не обрубок клієнту', async () => {
    chatCompletion
      .mockResolvedValueOnce(textResponse('Скільки кім', 'length'))
      .mockResolvedValueOnce(textResponse('Скільки кімнат?'))

    const res = await turn(history('Треба прибрати'), 'odesa')
    expect(res.reply).toBe('Скільки кімнат?')
  })
})

describe('чіпси (кнопки)', () => {
  it('рядок >>> перетворюється на варіанти й зникає з тексту', async () => {
    chatCompletion.mockResolvedValue(
      textResponse('Який тип помешкання?\n>>> Квартира | Дім | Офіс'),
    )

    const res = await turn(history('Привіт'), 'odesa')
    expect(res.reply).toBe('Який тип помешкання?')
    expect(res.suggestions).toEqual(['Квартира', 'Дім', 'Офіс'])
  })

  it('варіантів не більше шести і кожен обрізається', async () => {
    const many = Array.from({ length: 10 }, (_, i) => `Варіант ${i}`).join(
      ' | ',
    )
    chatCompletion.mockResolvedValue(
      textResponse(`Оберіть\n>>> ${many} | ${'я'.repeat(100)}`),
    )

    const res = await turn(history('Привіт'), 'odesa')
    expect(res.suggestions).toHaveLength(6)
    for (const s of res.suggestions ?? []) {
      expect(s.length).toBeLessThanOrEqual(32)
    }
  })

  it('порожні варіанти відкидаються', async () => {
    chatCompletion.mockResolvedValue(textResponse('Питання\n>>>  |  | Так'))

    const res = await turn(history('Привіт'), 'odesa')
    expect(res.suggestions).toEqual(['Так'])
  })

  it('без рядка >>> варіантів немає', async () => {
    chatCompletion.mockResolvedValue(textResponse('Яка площа?'))

    const res = await turn(history('Привіт'), 'odesa')
    expect(res.suggestions).toBeUndefined()
  })
})

describe('модель зривається в Markdown', () => {
  // Промпт забороняє Markdown, але модель регулярно віддає '* ' або '- '.
  // Клієнт малює список за протоколом «— », тож маркери нормалізуємо.
  it('маркери списку приводяться до протокольного «— »', async () => {
    chatCompletion.mockResolvedValue(
      textResponse('Уточню:\n* скільки кімнат\n- чи є тварини\n• поверх'),
    )

    const res = await turn(history('Привіт'), 'odesa')
    expect(res.reply).toContain('— скільки кімнат')
    expect(res.reply).toContain('— чи є тварини')
    expect(res.reply).toContain('— поверх')
    expect(res.reply).not.toMatch(/^\*/m)
  })

  it('зірочки всередині речення не чіпаються', async () => {
    chatCompletion.mockResolvedValue(textResponse('Ціна 5*5 метрів кімнати'))

    const res = await turn(history('Привіт'), 'odesa')
    expect(res.reply).toBe('Ціна 5*5 метрів кімнати')
  })
})

describe('передчасна пропозиція фото', () => {
  // Крок 6 (фото) — окреме повідомлення. Модель стабільно зливає його з
  // кроком 5, і клієнт отримує питання й пропозицію фото разом: відповідає
  // на щось одне, друге губиться.
  it('фото-абзац відрізається, якщо в повідомленні є питання', async () => {
    chatCompletion.mockResolvedValue(
      textResponse(
        'Уточню деталі:\n— чи є тварини\n— поверх\n\nТакож можеш додати фото кімнат, так майстру буде легше.',
      ),
    )

    const res = await turn(history('Привіт'), 'odesa')
    expect(res.reply).toContain('— чи є тварини')
    expect(res.reply).not.toContain('фото')
  })

  it('чисте фото-повідомлення не чіпають', async () => {
    chatCompletion.mockResolvedValue(
      textResponse(
        'Можеш додати фото кімнат — так майстру буде легше порахувати.',
      ),
    )

    const res = await turn(history('Привіт'), 'odesa')
    expect(res.reply).toContain('фото')
  })

  it('питання без фото проходить як є', async () => {
    chatCompletion.mockResolvedValue(
      textResponse('Уточню:\n— чи є тварини\n— поверх'),
    )

    const res = await turn(history('Привіт'), 'odesa')
    expect(res.reply).toContain('— поверх')
  })
})

describe('драфт заявки', () => {
  it('валідні дані інструмента стають драфтом із карткою', async () => {
    chatCompletion.mockResolvedValue(
      toolResponse({
        ...validDraft,
        title: 'Прибирання двокімнатної квартири',
        description:
          'Клієнт просить звичайне прибирання двокімнатної квартири сьогодні.',
      }),
    )

    const res = await turn(history('Прибрати двушку сьогодні'), 'odesa')

    expect(res.kind).toBe('draft')
    expect(res.draft?.metadata).toMatchObject(validDraft)
    expect(res.draft?.title).toBe('Прибирання двокімнатної квартири')
    expect(res.draft?.summary.length).toBeGreaterThan(0)
  })

  // Модель пише title сама, тобто це недовірений текст: короткий або
  // сміттєвий замінюється шаблонним.
  it('поганий title замінюється згенерованим', async () => {
    chatCompletion.mockResolvedValue(
      toolResponse({ ...validDraft, title: 'ок', description: 'я'.repeat(60) }),
    )

    const res = await turn(history('Прибрати'), 'odesa')
    expect(res.draft?.title).not.toBe('ок')
    expect(res.draft?.title.length ?? 0).toBeGreaterThan(8)
  })

  it('керуючі символи в title вичищаються', async () => {
    chatCompletion.mockResolvedValue(
      toolResponse({
        ...validDraft,
        title: `Прибирання${String.fromCharCode(0)}\nдвокімнатної квартири`,
        description: 'я'.repeat(60),
      }),
    )

    const res = await turn(history('Прибрати'), 'odesa')
    expect(res.draft?.title).not.toContain('\n')
    expect(res.draft?.title).not.toContain(String.fromCharCode(0))
  })

  it('поля поза схемою в драфт не потрапляють', async () => {
    chatCompletion.mockResolvedValue(
      toolResponse({
        ...validDraft,
        evil: 'payload',
        clientId: 'someone-else',
      }),
    )

    const res = await turn(history('Прибрати'), 'odesa')
    expect(res.draft?.metadata).not.toHaveProperty('evil')
    expect(res.draft?.metadata).not.toHaveProperty('clientId')
  })

  it('чіпси з тексту біля драфта не течуть у reply', async () => {
    chatCompletion.mockResolvedValue(
      toolResponse(
        {
          ...validDraft,
          title: 'Прибирання квартири',
          description: 'я'.repeat(60),
        },
        'Готово!\n>>> Створити | Змінити',
      ),
    )

    const res = await turn(history('Прибрати'), 'odesa')
    expect(res.reply).toBe('Готово!')
  })
})

describe('модель віддала сміття замість драфта', () => {
  // Валідація — остання лінія перед базою: те, що не пройшло, повертається
  // моделі на виправлення, а не їде в заявку.
  it('невалідні дані повертаються моделі на повтор', async () => {
    chatCompletion
      .mockResolvedValueOnce(
        toolResponse({ premise: 'вигадане', service: 'x' }),
      )
      .mockResolvedValueOnce(textResponse('Уточни, будь ласка, тип помешкання'))

    const res = await turn(history('Прибрати'), 'odesa')

    expect(res.kind).toBe('message')
    expect(res.reply).toContain('тип помешкання')
    expect(chatCompletion).toHaveBeenCalledTimes(2)
  })

  it('биті JSON-аргументи не валять хід', async () => {
    chatCompletion
      .mockResolvedValueOnce(toolResponse('{ це не json'))
      .mockResolvedValueOnce(textResponse('Уточни деталі'))

    const res = await turn(history('Прибрати'), 'odesa')
    expect(res.kind).toBe('message')
  })

  it('дата в минулому не проходить у драфт', async () => {
    chatCompletion
      .mockResolvedValueOnce(
        toolResponse({ ...validDraft, when: '2020-01-01' }),
      )
      .mockResolvedValueOnce(textResponse('На яку дату?'))

    const res = await turn(history('Прибрати вчора'), 'odesa')
    expect(res.kind).toBe('message')
  })

  // Уперте сміття не має крутити модель нескінченно: є стеля раундів
  // і людський фолбек.
  it('нескінченно невалідний драфт впирається в стелю раундів', async () => {
    chatCompletion.mockResolvedValue(toolResponse({ premise: 'вигадане' }))

    const res = await turn(history('Прибрати'), 'odesa')

    expect(res.kind).toBe('message')
    expect(res.reply.length).toBeGreaterThan(0)
    expect(chatCompletion.mock.calls.length).toBeLessThanOrEqual(4)
  })

  // Ретраї в tool-ланцюгу мусять іти без thinking: інакше DeepSeek віддає
  // 400 через відсутній reasoning_content (обмеження описане в deepseek.ts).
  it('ретраї йдуть без thinking', async () => {
    chatCompletion.mockResolvedValue(toolResponse({ premise: 'вигадане' }))

    await turn(history('Прибрати'), 'odesa')

    for (const call of chatCompletion.mock.calls) {
      expect(call[2]).toBe(false)
    }
  })
})

describe('мова діалогу', () => {
  it('російський діалог → російський промпт', async () => {
    await turn(
      history('привет, нужно убрать квартиру, сколько это стоит'),
      'odesa',
    )
    expect(sentSystemPrompt()).toContain('ОТВЕЧАЙ ТОЛЬКО НА РУССКОМ')
  })

  it('український діалог → український промпт', async () => {
    await turn(
      history('привіт, треба прибрати квартиру, скільки це коштує'),
      'odesa',
    )
    expect(sentSystemPrompt()).toContain('ВІДПОВІДАЙ ТІЛЬКИ УКРАЇНСЬКОЮ')
  })

  it('відповіді асистента на детект не впливають', async () => {
    await turn(
      [
        {
          role: 'assistant',
          content: 'Привіт! Треба прибрати? Скільки кімнат?',
        },
        { role: 'user', content: 'да, нужно убрать' },
      ],
      'odesa',
    )
    expect(sentSystemPrompt()).toContain('ОТВЕЧАЙ ТОЛЬКО НА РУССКОМ')
  })
})

// ── ЗНАЙДЕНА ДІРКА ────────────────────────────────────────────────────────
//
// У JavaScript \b і \w — ASCII-only: «слово» для них це [A-Za-z0-9_].
// У суцільно кириличному рядку межі слова НЕМАЄ ніде, тому регекси
// RU_MARKERS / UK_MARKERS у detectLang (agent.ts:207-210) НЕ СПРАЦЬОВУЮТЬ
// ЖОДНОГО РАЗУ — ні на російському тексті, ні на українському.
//
// Механізм слів-маркерів мертвий, і детект мовчки деградував рівно до того
// стану, який цей механізм і мав полагодити: рахунок по літерах
// [ыэъё] проти [іїєґ]. Коментар у коді описує проблему як розвʼязану.
//
// Наслідок для клієнта: російськомовна людина тисне чіп «Після ремонту»
// (у чіпах ЗАВЖДИ українські літери — їх пише наш же UI), і асистент
// посеред діалогу перемикається на українську.
//
// Лікується заміною \b на межу за Unicode-літерою:
//   /(^|[^\p{L}])(привет|нужно|…)(?![\p{L}])/giu
//
// Тести ЧЕРВОНІ навмисно.
describe('детект мови: слова-маркери', () => {
  it('передумова: \\b у JS не працює з кирилицею', () => {
    // Не про наш код — про поведінку рушія, на якій тримається діра.
    expect('привет, нужно убрать'.match(/\b(привет|нужно)\b/gi)).toBeNull()
    expect('привіт, треба прибрати'.match(/\b(привіт|треба)\b/gi)).toBeNull()
  })

  it('ДІРКА: російський текст із українським чіпом стає українським', async () => {
    await turn(
      [
        { role: 'user', content: 'привет, нужно убрать квартиру' },
        { role: 'assistant', content: 'Какой тип уборки?' },
        // Чіп із нашого ж UI — українські літери в російському діалозі.
        { role: 'user', content: 'Після ремонту' },
      ],
      'odesa',
    )
    expect(sentSystemPrompt()).toContain('ОТВЕЧАЙ ТОЛЬКО НА РУССКОМ')
  })

  it('ДІРКА: українська фраза без літер іїєґ вважається російською', async () => {
    // «треба прибрати квартиру завтра» — жодної з літер іїєґ і жодної з
    // ыэъё. Слова-маркери мали б витягнути це впевнено, але вони мертві,
    // тож рахунок 0:0 і спрацьовує дефолт — російська.
    await turn(history('треба прибрати квартиру завтра'), 'odesa')
    expect(sentSystemPrompt()).toContain('ВІДПОВІДАЙ ТІЛЬКИ УКРАЇНСЬКОЮ')
  })
})

describe('вікно історії', () => {
  it('у модель їде системний промпт плюс хвіст діалогу', async () => {
    const long = Array.from({ length: 40 }, (_, i) => `повідомлення ${i}`)
    await turn(history(...long), 'odesa')

    const messages = chatCompletion.mock.calls[0][0]
    expect(messages[0].role).toBe('system')
    // 16 останніх ходів + системний промпт.
    expect(messages).toHaveLength(17)
    expect(messages[messages.length - 1].content).toBe('повідомлення 39')
  })

  it('коротка історія їде цілком', async () => {
    await turn(history('привіт', 'вітаю', 'квартира'), 'odesa')
    expect(chatCompletion.mock.calls[0][0]).toHaveLength(4)
  })
})

describe('стрімовий хід', () => {
  it('текст віддається шматками одразу', async () => {
    chatCompletionStream.mockReturnValue(
      makeStream(
        [
          { type: 'text', delta: 'Скільки ' },
          { type: 'text', delta: 'кімнат?' },
        ],
        { content: 'Скільки кімнат?', toolCall: null, finishReason: 'stop' },
      ),
    )

    const deltas: string[] = []
    const res = await turnStream(history('Привіт'), 'odesa', (d) =>
      deltas.push(d),
    )

    expect(deltas).toEqual(['Скільки ', 'кімнат?'])
    expect(res.reply).toBe('Скільки кімнат?')
  })

  // Після tool_start модель віддає аргументи інструмента — це службові дані,
  // клієнту їх показувати не можна.
  it('після початку інструмента текст клієнту більше не йде', async () => {
    chatCompletionStream.mockReturnValue(
      makeStream(
        [
          { type: 'text', delta: 'Оформлюю' },
          { type: 'tool_start' },
          { type: 'text', delta: '{"premise":"apartment"' },
        ],
        {
          content: 'Оформлюю',
          toolCall: {
            id: 'c1',
            type: 'function',
            function: {
              name: TOOL_NAME,
              arguments: JSON.stringify({
                ...validDraft,
                title: 'Прибирання квартири',
                description: 'я'.repeat(60),
              }),
            },
          },
          finishReason: 'tool_calls',
        },
      ),
    )

    const deltas: string[] = []
    const res = await turnStream(history('Прибрати'), 'odesa', (d) =>
      deltas.push(d),
    )

    expect(deltas).toEqual(['Оформлюю'])
    expect(res.kind).toBe('draft')
  })

  it('обірваний звʼязок віддає написане плюс підказку', async () => {
    chatCompletionStream.mockReturnValue(
      (async function* () {
        yield { type: 'text', delta: 'Скільки ' } as StreamChunk
        throw new Error('socket closed')
        // eslint-disable-next-line no-unreachable
      })() as AsyncGenerator<StreamChunk, StreamResult, void>,
    )

    const res = await turnStream(history('Привіт'), 'odesa', () => {})

    expect(res.reply).toContain('Скільки')
    expect(res.reply).toContain('обірвався')
  })

  // Обрубок по max_tokens не має видаватись за готову відповідь: інакше
  // клієнт бачить обірване речення й не розуміє, що робити.
  it('обрив по ліміту токенів позначається явно', async () => {
    chatCompletionStream.mockReturnValue(
      makeStream([{ type: 'text', delta: 'Я почав відповідь' }], {
        content: 'Я почав відповідь',
        toolCall: null,
        finishReason: 'length',
      }),
    )

    const res = await turnStream(history('Привіт'), 'odesa', () => {})
    expect(res.reply).toContain('обірвалась')
  })

  it('порожній стрім дає людський фолбек, а не порожню бульбашку', async () => {
    chatCompletionStream.mockReturnValue(
      makeStream([], { content: '', toolCall: null, finishReason: 'stop' }),
    )

    const res = await turnStream(history('Привіт'), 'odesa', () => {})
    expect(res.reply.length).toBeGreaterThan(0)
  })

  // Модель інколи віддає САМ рядок >>> без тексту. Порожня бульбашка
  // потрапляє в історію, і наступного ходу модель не розуміє, що вже казала.
  it('самі чіпси без тексту отримують підводку', async () => {
    chatCompletionStream.mockReturnValue(
      makeStream([{ type: 'text', delta: '>>> Так | Ні' }], {
        content: '>>> Так | Ні',
        toolCall: null,
        finishReason: 'stop',
      }),
    )

    const res = await turnStream(history('Привіт'), 'odesa', () => {})
    expect(res.reply).toBe('Оберіть варіант:')
    expect(res.suggestions).toEqual(['Так', 'Ні'])
  })

  it('фото-чіпси не підставляються, якщо в повідомленні є питання', async () => {
    const text = '— чи є тварини\n— поверх'
    chatCompletionStream.mockReturnValue(
      makeStream([{ type: 'text', delta: text }], {
        content: text,
        toolCall: null,
        finishReason: 'stop',
      }),
    )

    const res = await turnStream(history('Привіт'), 'odesa', () => {})
    expect(res.suggestions).toBeUndefined()
  })
})

// ── ЗНАЙДЕНА ДІРКА ────────────────────────────────────────────────────────
//
// Той самий корінь, що й у детекті мови: \w — це [A-Za-z0-9_], тож у
// кириличному тексті він завжди матчить ПОРОЖНІЙ рядок. Регекс страховки
// фото-чіпсів (agent.ts:423)
//
//     /(додат|добав)\w*\s+фото|кнопк\w*\s*«?\+/i
//
// після «додат» вимагає \s+ (пробіл), а там стоїть «и» — збігу немає ніколи.
// Друга гілка мертва з тієї ж причини: після «кнопк» іде «у», а регекс
// чекає пробіл або «+».
//
// Наслідок: якщо модель забула рядок «>>>» (а вона забуває — заради цього
// страховку й писали), клієнт бачить пропозицію фото БЕЗ кнопок і мусить
// друкувати відповідь руками. Крок 6 — останній перед створенням заявки,
// і саме тут найдорожче втрачати людей.
//
// Лікується так само: \p{L}* з прапорцем u замість \w*.
//
// Тести ЧЕРВОНІ навмисно.
describe('страховка фото-чіпсів', () => {
  function streamText(text: string) {
    chatCompletionStream.mockReturnValue(
      makeStream([{ type: 'text', delta: text }], {
        content: text,
        toolCall: null,
        finishReason: 'stop',
      }),
    )
  }

  it('передумова: \\w у JS не покриває кирилицю', () => {
    expect(/(додат|добав)\w*\s+фото/i.test('Можеш додати фото кімнат')).toBe(
      false,
    )
    expect(/кнопк\w*\s*«?\+/i.test('натисни кнопку «+»')).toBe(false)
  })

  it('ДІРКА: пропозиція фото лишається без кнопок', async () => {
    streamText('Можеш додати фото кімнат — майстру буде легше порахувати.')

    const res = await turnStream(history('Привіт'), 'odesa', () => {})
    expect(res.suggestions).toEqual(['Додати фото', 'Продовжити без фото'])
  })

  it('ДІРКА: підказка про кнопку «+» теж лишається без кнопок', async () => {
    streamText('Натисни кнопку «+» і додай фото — так буде точніше.')

    const res = await turnStream(history('Привіт'), 'odesa', () => {})
    expect(res.suggestions).toEqual(['Додати фото', 'Продовжити без фото'])
  })
})
