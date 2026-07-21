// src/lib/server/zunor/agent.ts
//
// Мозок Zunor-агента: схема інструмента + один хід діалогу.
// Системний промпт — «воронка контексту» (prompt.ts): база + focus активної
// послуги (detectActiveService). LLM повертає НЕДОВІРЕНИЙ ввід:
//   metadata → validateCleaningMetadata; title/description → sanitize + фолбек.
// Side-effect-інструментів немає: заявку створює POST /api/jobs після
// підтвердження людиною. Максимальна шкода інʼєкції — дивний текст або не той
// трек цінових підказок (людина підтверджує очима).
import {
  PREMISES,
  SERVICES,
  ROOM_OPTIONS,
  ELEVATOR_OPTIONS,
  BALCONY_OPTIONS,
  TRASH_OPTIONS,
  FREQUENCY_OPTIONS,
  SOFA_ITEMS,
} from '$lib/categories/cleaning/presets'
import { validateCleaningMetadata } from '$lib/categories/cleaning/validate'
import { generateTitle } from '$lib/categories/cleaning/title-gen'
import { describeJob } from '$lib/categories/cleaning/describe'
import { sanitizeJobTitle, sanitizeJobDescription } from '$lib/server/job-copy'
import { chatCompletion, type DsMessage, type DsTool } from './deepseek'
import { buildSystemPrompt, TOOL_NAME } from './prompt'
import { detectActiveService } from './detect-service'
import type { ZunorClientMessage, ZunorResponse } from '$lib/types/zunor'
import { dev } from '$app/environment'

const MAX_TOOL_ROUNDS = 3

function keys(list: ReadonlyArray<{ key: string }>): string[] {
  return list.map((o) => o.key)
}

// ─── Схема інструмента — ГЕНЕРУЄТЬСЯ з presets.ts ───
function buildTool(): DsTool {
  return {
    type: 'function',
    function: {
      name: TOOL_NAME,
      description:
        'Викликай, коли зібрано ВСІ обовʼязкові дані заявки на прибирання. ' +
        'Разом із даними згенеруй назву (title) та опис (description) заявки.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description:
              'Назва заявки українською: 3–7 слів, конкретна і зрозуміла майстру ' +
              '(тип прибирання + обʼєкт + ключова деталь). Без крапки в кінці, ' +
              'без емодзі. Приклад: "Генеральне прибирання 2-кімнатної квартири"',
          },
          description: {
            type: 'string',
            description:
              'Опис для майстра: 2–4 речення. Що прибрати, обсяг, коли, важливі ' +
              'особливості зі слів клієнта. ТІЛЬКИ факти з розмови, нічого не ' +
              'вигадуй. Без адреси, без ціни, без контактів.',
          },
          premise: { type: 'string', enum: keys(PREMISES) },
          service: { type: 'string', enum: keys(SERVICES) },
          when: {
            type: 'string',
            description:
              "'today', 'tomorrow' або ISO-дата YYYY-MM-DD (не в минулому)",
          },
          rooms: { type: 'string', enum: keys(ROOM_OPTIONS) },
          floor: { type: 'integer', minimum: 0, maximum: 200 },
          hasElevator: { type: 'string', enum: keys(ELEVATOR_OPTIONS) },
          trash: { type: 'string', enum: keys(TRASH_OPTIONS) },
          frequency: { type: 'string', enum: keys(FREQUENCY_OPTIONS) },
          windowsCount: { type: 'integer', minimum: 1, maximum: 200 },
          balcony: { type: 'string', enum: keys(BALCONY_OPTIONS) },
          items: {
            type: 'array',
            description: 'Для хімчистки: предмети і кількість',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: keys(SOFA_ITEMS) },
                variant: { type: 'string' },
                qty: { type: 'integer', minimum: 1, maximum: 50 },
              },
              required: ['type', 'qty'],
            },
          },
        },
        required: ['title', 'description', 'premise', 'service', 'when'],
      },
    },
  }
}

/** Пари label/value для summary-картки з провалідованої metadata. */
function buildSummary(
  clean: Record<string, unknown>,
): Array<{ label: string; value: string; icon?: string }> {
  return describeJob(clean).map((d) => ({
    label: d.label,
    value: d.items
      ? d.items.map((i) => `${i.name} × ${i.qty}`).join(', ')
      : d.value,
    icon: d.icon,
  }))
}

/**
 * Швидкі відповіді — ОСТАННІЙ рядок «>>> Квартира | Будинок».
 * Парсимо і вирізаємо з тексту. Формат простий навмисно: жодного JSON у тексті.
 */
function extractSuggestions(text: string): {
  reply: string
  suggestions?: string[]
} {
  const lines = text.trimEnd().split('\n')
  const last = (lines[lines.length - 1] ?? '').trim()
  if (!last.startsWith('>>>')) return { reply: text.trim() }
  const suggestions = last
    .slice(3)
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((x) => x.slice(0, 32))
  const reply = lines.slice(0, -1).join('\n').trim()
  return suggestions.length ? { reply, suggestions } : { reply }
}

// ─── Один хід діалогу ───
export async function runZunorTurn(
  history: ZunorClientMessage[],
  city: string | null,
): Promise<ZunorResponse> {
  // ВОРОНКА: детект активної послуги (скан історії з кінця) → промпт під неї.
  // Історія в межах ходу не змінюється → детект один раз, поза циклом повторів.
  const activeService = detectActiveService(history)

  const tool = buildTool()
  const messages: DsMessage[] = [
    { role: 'system', content: buildSystemPrompt(city, activeService) },
    ...history.map((m): DsMessage => ({ role: m.role, content: m.content })),
  ]

  let lastValidationError = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await chatCompletion(messages, [tool])
    const msg = res.choices[0]?.message
    const finish = res.choices[0]?.finish_reason
    // Обрив по ліміту токенів: НЕ показуємо обрубок клієнту.
    // Якщо це був незавершений драфт — повторюємо коло; текст-обрубок ігноруємо.
    if (finish === 'length' && !msg?.tool_calls?.length) {
      if (dev) console.warn('[zunor] truncated response, retrying round')
      messages.push({
        role: 'user',
        content:
          'Твоя попередня відповідь обірвалась. Дай коротшу відповідь: якщо всі дані є — одразу виклич інструмент, якщо ні — постав лише одне питання.',
      })
      continue
    }
    if (!msg) throw new Error('DeepSeek: empty choices')

    const call = msg.tool_calls?.find((c) => c.function.name === TOOL_NAME)

    // Звичайна текстова відповідь — просто повідомлення чату
    if (!call) {
      const raw = (msg.content ?? '').trim()
      if (!raw) {
        messages.push({
          role: 'user',
          content:
            'Клієнт не додає фото. Усі обовʼязкові дані вже є в розмові. ' +
            `Виклич ${TOOL_NAME} зараз, для вікон обовʼязково постав windowsCount.`,
        })
        continue
      }
      const { reply, suggestions } = extractSuggestions(raw)
      return { kind: 'message', reply, suggestions }
    }

    // Драфт → парсимо і валідуємо ЯК НЕДОВІРЕНИЙ ВВІД
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(call.function.arguments) as Record<string, unknown>
    } catch {
      /* биті arguments → впадуть на валідації нижче */
    }

    const { title: rawTitle, description: rawDescription, ...metadata } = args
    const validation = validateCleaningMetadata(metadata)

    if (validation.ok && validation.clean) {
      const clean = validation.clean
      const title = sanitizeJobTitle(rawTitle) ?? generateTitle(clean)
      const description = sanitizeJobDescription(rawDescription) ?? ''
      return {
        kind: 'draft',
        reply:
          extractSuggestions((msg.content ?? '').trim()).reply ||
          'Ось що в мене вийшло — перевір, будь ласка.',
        draft: {
          metadata: clean,
          title,
          description,
          summary: buildSummary(clean as unknown as Record<string, unknown>),
        },
      }
    }

    // Невалідний драфт: помилку повертаємо МОДЕЛІ (не юзеру) на один повтор
    messages.push({
      role: 'assistant',
      content: msg.content ?? '',
      tool_calls: [call],
    })
    lastValidationError = validation.error ?? ''
    messages.push({
      role: 'tool',
      tool_call_id: call.id,
      content: `Помилка валідації: ${validation.error ?? 'невідома'}. Виправ дані (звір дату з календарем із системних інструкцій) і виклич інструмент ще раз, або постав клієнту ОДНЕ уточнююче питання.`,
    })
  }

  return {
    kind: 'message',
    reply: lastValidationError
      ? `Щось не сходиться: ${lastValidationError.toLowerCase()}. Сформулюй, будь ласка, інакше — і я оформлю.`
      : 'Мені бракує деталей. Уточни, будь ласка: що саме прибираємо і коли?',
  }
}
