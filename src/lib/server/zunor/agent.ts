// src/lib/server/zunor/agent.ts
//
// Мозок Zunor-агента: схема інструмента + один хід діалогу.
//
// Архітектура надійності — три рубежі:
//   1. Промпт (prompt.ts): воронка + ФОКУС активної послуги (detectActiveService).
//   2. Серверний enforcement (цей файл): LLM повертає НЕДОВІРЕНИЙ ввід —
//      metadata → validateCleaningMetadata; title/description → sanitize + фолбек;
//      маркери списків → normalizeListMarkers; передчасне фото → stripPrematurePhotoOffer.
//   3. Людина: заявку створює POST /api/jobs лише після кнопки «Підтвердити».
// Side-effect-інструментів немає. Максимальна шкода інʼєкції — дивний текст,
// який людина побачить очима до підтвердження.
//
// ДВА ШЛЯХИ:
//   runZunorTurnStream — основний: стрімить текст клієнту одразу; на драфт
//                        перемикається в синхронну валідацію.
//   runZunorTurn       — синхронний фолбек (повний JSON).
//
// РЕЖИМ THINKING (deepseek.ts): вмикається лише коли в історії є «простиня»
// (needsThinking) — non-thinking v4-flash губить факти з довгих входів.
// Ретраї resolveDraft — ЗАВЖДИ без thinking: thinking-ланцюг із tool_call
// вимагає повертати reasoning_content, інакше API віддає 400.

import { dev } from '$app/environment'
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
import {
  chatCompletion,
  chatCompletionStream,
  type DsMessage,
  type DsTool,
  type DsToolCall,
} from './deepseek'
import { buildSystemPrompt, TOOL_NAME } from './prompt'
import { detectActiveService } from './detect-service'
import type { ZunorClientMessage, ZunorResponse } from '$lib/types/zunor'

// ─────────────────────────── Константи ───────────────────────────

const MAX_TOOL_ROUNDS = 3
const MAX_HISTORY = 16 // хвіст діалогу — заявка коротка, весь контекст зайвий
const THINKING_THRESHOLD = 200 // символів: довше — «простиня», вмикаємо thinking

// ─────────────────────────── Схема інструмента ───────────────────────────
// Генерується з presets.ts — enum-ключі не можуть розійтись із валідацією.

function keys(list: ReadonlyArray<{ key: string }>): string[] {
  return list.map((o) => o.key)
}

function buildTool(): DsTool {
  return {
    type: 'function',
    function: {
      name: TOOL_NAME,
      description:
        'Оформлення драфту заявки на прибирання. Викликай ЛИШЕ після фото-кроку: ' +
        'клієнт надіслав фото або обрав «Продовжити без фото» (виняток: фото були ' +
        'додані раніше — тоді одразу після збору всіх обовʼязкових даних). ' +
        'Разом із даними згенеруй назву (title) та опис (description) українською.',
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
              'Опис для майстра: 2–4 речення українською. ЛИШЕ факти з розмови, ' +
              'яких НЕМАЄ в інших полях: площа, санвузли, сторона миття, тварини, ' +
              'доступ, стан, побажання клієнта. ЗАБОРОНЕНО повторювати тип ' +
              'прибирання, помешкання, кількість кімнат чи вікон і дату — клієнт ' +
              'бачить їх окремо. Без адреси, без ціни, без контактів, БЕЗ приміток ' +
              'про фото (додано/не додано — система показує це сама). ' +
              'НЕ додавай власних оцінок і порад («площа невелика», «бажано ' +
              'врахувати») — лише факти. Приклад ПОГАНО: «потрібна драбина ' +
              '(майстер приносить свою)» — клієнт не казав, хто приносить. ' +
              'Приклад ДОБРЕ: «доступ з драбини». Факт не прозвучав — його НЕ існує.',
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

// ─────────────────────── Обробка тексту моделі ───────────────────────

/**
 * Markdown-маркери → протокольне «— ». Модель інколи зривається в '* '/'- '
 * попри заборону в промпті; зірочки всередині тексту не чіпаємо.
 */
function normalizeListMarkers(text: string): string {
  return text.replace(/^[ \t]*[*\-•][ \t]+/gm, '— ')
}

/**
 * Enforcement кроку 6: модель стабільно зливає питання кроку 5 і пропозицію
 * фото в одне повідомлення. Якщо в тексті Є питання-пункти («— …») І Є
 * абзац-пропозиція фото — фото-абзац і все після нього відкидаємо: клієнт
 * відповідає на питання, фото-крок модель проведе наступним ходом (за
 * історією він ще не відбувся). Чисте фото-повідомлення не чіпаємо.
 */
const PHOTO_OFFER_RE =
  /(додат|додай|добав|прикріп|надішл|надісл|сбрось|скинь|отправ|пришл)\w*[^\n]{0,40}фото|фото[^\n]{0,40}(додат|добав|прикріп|сбрось|скинь)/i

function stripPrematurePhotoOffer(reply: string): string {
  if (!/^—\s/m.test(reply)) return reply

  const paragraphs = reply.split(/\n{2,}/)
  const photoAt = paragraphs.findIndex(
    (p) => !p.trimStart().startsWith('— ') && PHOTO_OFFER_RE.test(p),
  )
  if (photoAt === -1) return reply

  return paragraphs.slice(0, photoAt).join('\n\n').trim()
}

/**
 * Ріже рядок «>>> A | B» на чіпси. Спершу нормалізує маркери (щоб '* питання'
 * стало '— питання' і його побачив stripPrematurePhotoOffer), потім ріже
 * передчасне фото — порядок важливий.
 */
function extractSuggestions(text: string): {
  reply: string
  suggestions?: string[]
} {
  const normalized = stripPrematurePhotoOffer(normalizeListMarkers(text))
  const lines = normalized.trimEnd().split('\n')
  const last = (lines[lines.length - 1] ?? '').trim()
  if (!last.startsWith('>>>')) return { reply: normalized.trim() }

  const suggestions = last
    .slice(3)
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((x) => x.slice(0, 32))
  const reply = lines.slice(0, -1).join('\n').trim()
  return suggestions.length ? { reply, suggestions } : { reply }
}

// ─────────────────────── Історія та режим ───────────────────────

function trimHistory(history: ZunorClientMessage[]): ZunorClientMessage[] {
  return history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history
}

/**
 * Простиня в історії (багато фактів одним повідомленням) → thinking.
 * Дивимось усю тримлену історію, не лише останній хід: драфт збирається
 * з фактів простині, навіть якщо останнє повідомлення — коротке «да».
 */
function needsThinking(history: ZunorClientMessage[]): boolean {
  return trimHistory(history).some(
    (m) => m.role === 'user' && m.content.length > THINKING_THRESHOLD,
  )
}

function baseMessages(
  history: ZunorClientMessage[],
  city: string | null,
): { messages: DsMessage[] } {
  // Детект послуги — по ПОВНІЙ історії: послуга могла бути названа на
  // початку, який уже випав з вікна MAX_HISTORY. LLM отримує хвіст,
  // але ФОКУС-блок у промпті має лишатися стабільним до кінця воронки.
  const activeService = detectActiveService(history)
  const messages: DsMessage[] = [
    { role: 'system', content: buildSystemPrompt(city, activeService) },
    ...trimHistory(history).map(
      (m): DsMessage => ({ role: m.role, content: m.content }),
    ),
  ]
  return { messages }
}

// ─────────────────────── Драфт: валідація + ретраї ───────────────────────
// Викликається і зі стріму (tool_start), і з синхронного шляху.
// Драфт клієнт НЕ бачить до успішної валідації, тому все синхронне.

async function resolveDraft(
  messages: DsMessage[],
  tool: DsTool,
  firstText: string,
  firstCall: DsToolCall,
): Promise<ZunorResponse> {
  let call: DsToolCall | null = firstCall
  let text = firstText
  let lastValidationError = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (call) {
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
        return {
          kind: 'draft',
          reply: extractSuggestions(text.trim()).reply,
          draft: {
            metadata: clean,
            title: sanitizeJobTitle(rawTitle) ?? generateTitle(clean),
            description: sanitizeJobDescription(rawDescription) ?? '',
            summary: describeJob(clean).map((d) => ({
              label: d.label,
              value: d.items
                ? d.items.map((i) => `${i.name} × ${i.qty}`).join(', ')
                : d.value,
              icon: d.icon,
            })),
          },
        }
      }

      // Невалідний драфт: помилку → моделі на повтор
      messages.push({ role: 'assistant', content: text, tool_calls: [call] })
      lastValidationError = validation.error ?? ''
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: `Помилка валідації: ${validation.error ?? 'невідома'}. Виправ дані (звір дату з календарем із системних інструкцій) і виклич інструмент ще раз, або постав клієнту ОДНЕ уточнююче питання.`,
      })
    }

    // Ретрай — ЗАВЖДИ без thinking (див. шапку файлу: інакше 400 через
    // відсутній reasoning_content у tool-ланцюгу).
    const res = await chatCompletion(messages, [tool], false)
    const msg = res.choices[0]?.message
    if (!msg) break
    text = (msg.content ?? '').trim()
    call = msg.tool_calls?.find((c) => c.function.name === TOOL_NAME) ?? null

    // Текст замість драфта — це питання клієнту, віддаємо
    if (!call && text) {
      const { reply, suggestions } = extractSuggestions(text)
      return { kind: 'message', reply, suggestions }
    }
  }

  return {
    kind: 'message',
    reply: lastValidationError
      ? `Щось не сходиться: ${lastValidationError.toLowerCase()}. Сформулюй, будь ласка, інакше — і я оформлю.`
      : 'Мені бракує деталей. Уточни, будь ласка: що саме прибираємо і коли?',
  }
}

// ─────────────────────── Стрімовий хід (основний) ───────────────────────
// onText — кожен шматок тексту одразу клієнту. Повертає ZunorResponse:
// draft (після валідації), suggestions (з повного тексту) або фолбек.
// Клієнт: для kind==='message' стрімлений текст уже показано, з фіналу
// бере draft/suggestions і чистий reply.

export async function runZunorTurnStream(
  history: ZunorClientMessage[],
  city: string | null,
  onText: (delta: string) => void,
): Promise<ZunorResponse> {
  const tool = buildTool()
  const { messages } = baseMessages(history, city)

  const stream = chatCompletionStream(messages, [tool], needsThinking(history))
  let streamedText = ''
  let toolStarted = false

  // Ручний прохід генератора, щоб дістати return-значення (StreamResult).
  // Перший next() без catch: до першого чанка клієнт нічого не бачив,
  // виняток чесно обробить ендпоінт.
  let result = await stream.next()
  while (!result.done) {
    const chunk = result.value
    if (chunk.type === 'tool_start') {
      toolStarted = true
    } else if (chunk.type === 'text' && !toolStarted) {
      streamedText += chunk.delta
      onText(chunk.delta)
    }
    try {
      result = await stream.next()
    } catch (e) {
      console.error('[zunor] stream aborted mid-flight', e)
      const partial = streamedText.trim()
      return {
        kind: 'message',
        reply: partial
          ? partial +
            '\n\nЗвʼязок обірвався на півслові — напиши «продовжуй», і я договорю.'
          : 'Звʼязок обірвався. Спробуй ще раз.',
      }
    }
  }

  const { content, toolCall, finishReason } = result.value

  // Драфт: стрім зібрав tool_call → синхронна валідація
  if (toolCall) {
    return resolveDraft(messages, tool, content, toolCall)
  }

  // Уперлись у max_tokens: не видаємо обрубок за готову відповідь
  if (finishReason === 'length') {
    console.warn('[zunor] stream truncated by max_tokens')
    const partial = streamedText.trim()
    return {
      kind: 'message',
      reply: partial
        ? partial +
          '\n\nВідповідь обірвалась — напиши «продовжуй», і я договорю.'
        : 'Я задумався і не встиг відповісти. Повтори, будь ласка, останнє повідомлення.',
    }
  }

  const raw = (streamedText || content).trim()
  if (!raw) {
    return {
      kind: 'message',
      reply:
        'Вибач, я трохи збився. Нагадай, будь ласка, останню деталь — і продовжимо.',
    }
  }
  const { reply, suggestions } = extractSuggestions(raw)

  // Страховка фото-чіпсів — ЛИШЕ для чистого фото-кроку: якщо в повідомленні
  // є інші питання (рядки «— »), чіпси фото туди підставляти не можна.
  if (
    !suggestions?.length &&
    /(додат|добав)\w*\s+фото|кнопк\w*\s*«?\+/i.test(reply) &&
    !/^—\s/m.test(reply)
  ) {
    return {
      kind: 'message',
      reply,
      suggestions: ['Додати фото', 'Продовжити без фото'],
    }
  }

  return { kind: 'message', reply, suggestions }
}

// ─────────────────────── Синхронний хід (фолбек) ───────────────────────

export async function runZunorTurn(
  history: ZunorClientMessage[],
  city: string | null,
): Promise<ZunorResponse> {
  const tool = buildTool()
  const { messages } = baseMessages(history, city)

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await chatCompletion(messages, [tool], false)
    const msg = res.choices[0]?.message
    const finish = res.choices[0]?.finish_reason

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

    return resolveDraft(messages, tool, (msg.content ?? '').trim(), call)
  }

  return {
    kind: 'message',
    reply:
      'Мені бракує деталей. Уточни, будь ласка: що саме прибираємо і коли?',
  }
}
