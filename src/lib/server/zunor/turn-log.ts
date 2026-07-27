// src/lib/server/zunor/turn-log.ts
//
// Dev-логер одного ходу Zunor. Пише у .zunor-logs/<дата>/ по файлу на хід:
// системний промпт, історія, ПОЛЯ схеми інструмента, кожен виклик моделі
// з відповіддю, результат валідації і фінальний ZunorResponse.
//
// Навіщо: без цього «ІІ поставив не те питання» неможливо відлагодити —
// не видно ні що модель отримала, ні що повернула.
//
// Контракти:
//   1. НІКОЛИ не роняє запит. Будь-яка помилка запису проковтується.
//   2. У проді — no-op: файли не пишуться, памʼять не витрачається.
//   3. Контекст протягується через AsyncLocalStorage, щоб не міняти
//      сигнатури agent.ts/deepseek.ts заради dev-інструмента.

import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dev } from '$app/environment'
import type { DsMessage, DsTool } from './deepseek'

const LOG_DIR = '.zunor-logs'
/** Скільки символів контенту одного повідомлення історії показувати. */
const HISTORY_PREVIEW = 400

export interface TurnLogger {
  /** Один раз на хід: детект послуги + схема інструмента. */
  setup(info: { service: string | null; tool: DsTool }): void
  /** Перед КОЖНИМ запитом до моделі. */
  request(label: string, messages: DsMessage[], thinking: boolean): void
  /** Після КОЖНОЇ відповіді моделі. */
  response(info: {
    text: string
    toolCall: { name: string; arguments: string } | null
    finishReason: string | null
    tokens?: number
    ms: number
  }): void
  /** Результат validateCleaningMetadata над аргументами tool_call. */
  validation(ok: boolean, error?: string): void
  /** Фінальний обʼєкт, що йде клієнту. */
  final(value: unknown): void
  /** Довільна помітка (гілка коду, фолбек, обрив стріму). */
  note(line: string): void
}

// ─────────────────────── No-op для проду ───────────────────────

const NOOP: TurnLogger = {
  setup: () => {},
  request: () => {},
  response: () => {},
  validation: () => {},
  final: () => {},
  note: () => {},
}

// ─────────────────────── Реалізація ───────────────────────

/** Огортає текст у 4-бектіковий фенс: усередині можуть бути свої бектіки. */
function fence(body: string): string {
  return '````\n' + body.trimEnd() + '\n````'
}

function shorten(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}… (+${s.length - max})`
}

class FileTurnLogger implements TurnLogger {
  private readonly startedAt = Date.now()
  private readonly blocks: string[] = []
  private service: string | null = null
  private toolFields = ''
  private callIndex = 0

  constructor(private readonly meta: { userId: string; city: string | null }) {}

  setup(info: { service: string | null; tool: DsTool }): void {
    this.service = info.service
    const params = info.tool.function.parameters as {
      properties?: Record<string, unknown>
      required?: string[]
    }
    const all = Object.keys(params.properties ?? {})
    const required = params.required ?? []
    // Найважливіший рядок логу: якщо тут є trash при мийці вікон —
    // баг знайдено, далі промпт можна не читати.
    this.toolFields =
      `все (${all.length}): ${all.join(', ')}\n` +
      `обовʼязкові: ${required.join(', ') || '—'}`
  }

  request(label: string, messages: DsMessage[], thinking: boolean): void {
    this.callIndex += 1
    const system = messages.find((m) => m.role === 'system')?.content ?? ''
    const rest = messages.filter((m) => m.role !== 'system')

    const history = rest
      .map((m) => {
        const head = m.tool_calls?.length
          ? `[${m.role} → tool_call]`
          : `[${m.role}]`
        const body = m.content ?? ''
        const args = m.tool_calls?.[0]?.function.arguments
        return `${head} ${shorten(body, HISTORY_PREVIEW)}${
          args ? `\n     args: ${shorten(args, HISTORY_PREVIEW)}` : ''
        }`
      })
      .join('\n')

    this.blocks.push(
      `## Виклик ${this.callIndex} — ${label} (thinking: ${thinking ? 'on' : 'off'})\n\n` +
        `### Системний промпт (${system.length} знаків)\n${fence(system)}\n\n` +
        `### Історія (${rest.length})\n${fence(history || '—')}`,
    )
  }

  response(info: {
    text: string
    toolCall: { name: string; arguments: string } | null
    finishReason: string | null
    tokens?: number
    ms: number
  }): void {
    const head =
      `### Відповідь — ${(info.ms / 1000).toFixed(1)}s · ` +
      `finish: ${info.finishReason ?? '—'} · ` +
      `tokens: ${info.tokens ?? '—'}`

    const parts = [head, '', `text:\n${fence(info.text || '—')}`]

    if (info.toolCall) {
      let pretty = info.toolCall.arguments
      try {
        pretty = JSON.stringify(JSON.parse(pretty), null, 2)
      } catch {
        /* биті arguments — показуємо як є, це теж діагностика */
      }
      parts.push('', `tool_call: ${info.toolCall.name}\n${fence(pretty)}`)
    }

    this.blocks.push(parts.join('\n'))
  }

  validation(ok: boolean, error?: string): void {
    this.blocks.push(
      `### Валідація\n${ok ? 'OK' : `FAIL — ${error ?? 'невідома помилка'}`}`,
    )
  }

  final(value: unknown): void {
    let body: string
    try {
      body = JSON.stringify(value, null, 2)
    } catch {
      body = String(value)
    }
    this.blocks.push(`## Фінал (клієнту)\n${fence(body)}`)
  }

  note(line: string): void {
    this.blocks.push(`> ${line}`)
  }

  /** Пише файл. Помилки лише логуються — хід уже відпрацював. */
  async flush(): Promise<void> {
    const now = new Date()
    const day = now.toISOString().slice(0, 10)
    const time = now.toISOString().slice(11, 19).replace(/:/g, '-')
    const suffix = Math.random().toString(36).slice(2, 6)
    const dir = join(process.cwd(), LOG_DIR, day)
    const file = join(
      dir,
      `${time}_${this.service ?? 'no-service'}_${suffix}.md`,
    )

    const header =
      `# Zunor turn — ${day} ${time.replace(/-/g, ':')}\n\n` +
      `user: ${this.meta.userId} · ` +
      `місто: ${this.meta.city ?? '—'} · ` +
      `послуга: ${this.service ?? 'не визначена'} · ` +
      `всього: ${((Date.now() - this.startedAt) / 1000).toFixed(1)}s\n\n` +
      `## Поля схеми інструмента\n${fence(this.toolFields || '—')}`

    try {
      await mkdir(dir, { recursive: true })
      await writeFile(file, [header, ...this.blocks].join('\n\n'), 'utf8')
      console.log(
        `[zunor] log → ${LOG_DIR}/${day}/${time}_${this.service ?? 'no-service'}_${suffix}.md`,
      )
    } catch (err) {
      console.error('[zunor] не вдалось записати лог:', err)
    }
  }
}

// ─────────────────────── Контекст ───────────────────────

const storage = new AsyncLocalStorage<TurnLogger>()

/**
 * Логер поточного ходу. Поза контекстом (або в проді) — no-op,
 * тому виклик безпечний з будь-якого місця без перевірок.
 */
export function turnLog(): TurnLogger {
  return storage.getStore() ?? NOOP
}

/**
 * Огортає один хід діалогу. У проді просто виконує fn без накладних витрат.
 * Файл пишеться у finally — навіть якщо хід упав із винятком.
 */
export async function withTurnLog<T>(
  meta: { userId: string; city: string | null },
  fn: () => Promise<T>,
): Promise<T> {
  if (!dev) return fn()

  const logger = new FileTurnLogger(meta)
  try {
    return await storage.run(logger, fn)
  } finally {
    await logger.flush()
  }
}
