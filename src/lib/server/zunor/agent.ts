// Мозок Zunor-агента: схема інструмента + один хід діалогу.
//
// Відповідь моделі — НЕДОВІРЕНИЙ ввід, тому все, що вона повертає, проходить
// через валідатори нижче (metadata, title/description, маркери списків).
// Інструментів із side-effect у агента немає, а заявку створює POST /api/jobs
// лише після кнопки «Підтвердити» — максимальна шкода інʼєкції — дивний текст,
// який людина побачить очима.
//
// runZunorTurnStream — основний шлях, стрімить текст одразу; на драфті
// перемикається в синхронну валідацію. runZunorTurn — синхронний фолбек.

import { dev } from '$app/environment'
import {
  PREMISES,
  SERVICES,
  ROOM_OPTIONS,
  ELEVATOR_OPTIONS,
  BALCONY_OPTIONS,
  TRASH_OPTIONS,
  FREQUENCY_OPTIONS,
  WINDOW_SIDE_OPTIONS,
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
import { buildSystemPrompt, TOOL_NAME, type DialogLang } from './prompt'
import { detectActiveService } from './detect-service'
import { premiseMentioned, questionChips, type ChipContext } from './chips'
import { turnLog } from './turn-log'
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
              'Опис для майстра: 2–4 речення українською, або порожній рядок, якщо ' +
              'деталей поза полями немає. ЛИШЕ факти з розмови, ' +
              'яких НЕМАЄ в інших полях: санвузли, обсяг сміття, роботи ' +
              'понад стандарт, тварини, доступ, стан, побажання клієнта. Лише ' +
              'ствердні факти: заперечення («тварин немає») і невідоме («не ' +
              'уточнив») НЕ пиши. ЗАБОРОНЕНО повторювати тип ' +
              'прибирання, помешкання, кількість кімнат чи вікон, площу (вона в ' +
              'areaM2; виняток — розмір килима для хімчистки) і дату — клієнт ' +
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
          areaM2: {
            type: 'integer',
            minimum: 1,
            maximum: 100000,
            description:
              'Приблизна площа в м², ЯКЩО клієнт її назвав (числом або ' +
              'словами). Не вигадуй і не виводь із кімнат. Для вікон і ' +
              'хімчистки не заповнюй.',
          },
          effortAdjust: {
            type: 'integer',
            enum: [-1, 0, 1],
            description:
              'Поправка до обсягу роботи — сам обсяг система рахує з полів. ' +
              '1 — лише коли з розмови ЯВНО видно, що робота важча, ніж ' +
              'кажуть поля: вітрини чи панорамне скління в ТЦ, дуже високі ' +
              'стелі, сильне забруднення, багато речей. -1 — помітно легша ' +
              '(одна невелика зона), а площі в areaM2 немає: названу площу ' +
              'система вже врахувала, вдруге за неї не зменшуй. Інакше 0. ' +
              'Клієнта про це НЕ питай і в тексті не згадуй.',
          },
          floor: { type: 'integer', minimum: 0, maximum: 200 },
          hasElevator: { type: 'string', enum: keys(ELEVATOR_OPTIONS) },
          trash: { type: 'string', enum: keys(TRASH_OPTIONS) },
          frequency: { type: 'string', enum: keys(FREQUENCY_OPTIONS) },
          windowsCount: { type: 'integer', minimum: 1, maximum: 200 },
          windowSide: {
            type: 'string',
            enum: keys(WINDOW_SIDE_OPTIONS),
            description:
              'ОБОВʼЯЗКОВЕ для послуги windows: з якого боку мити. ' +
              'Ніколи не вгадуй — це питання ставиться завжди.',
          },
          balcony: {
            type: 'string',
            enum: keys(BALCONY_OPTIONS),
            description:
              'Лише генеральне прибирання КВАРТИРИ: балкон, який ТРЕБА прибрати. ' +
              'Балкон є, але прибирати не треба → none. Для інших послуг ' +
              '(вікна теж) балкон іде в description: поле там не зберігається.',
          },
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
 *
 * Рядок >>> шукаємо не лише останнім: модель інколи дописує після нього
 * «або напиши свій варіант», і тоді кнопки губились, а сирий «>>> …»
 * лишався в тексті повідомлення.
 */
function extractSuggestions(text: string): {
  reply: string
  suggestions?: string[]
} {
  const normalized = stripPrematurePhotoOffer(normalizeListMarkers(text))
  const lines = normalized.trimEnd().split('\n')
  const at = lines.findLastIndex((l) => l.trim().startsWith('>>>'))
  if (at === -1) return { reply: normalized.trim() }

  const suggestions = lines[at]!.trim()
    .slice(3)
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((x) => x.slice(0, 32))
  const reply = [...lines.slice(0, at), ...lines.slice(at + 1)]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return suggestions.length ? { reply, suggestions } : { reply }
}

/** Мова й послуга ходу: від них залежать промпт і підставні кнопки. */
type TurnContext = ChipContext

/**
 * Текст моделі → повідомлення клієнту. Один шлях для стріму, синхронного
 * ходу й питання після невалідного драфта: страховки кнопок раніше жили
 * лише в стрімі, і фолбек-хід приходив без них.
 */
function toMessage(raw: string, ctx: TurnContext): ZunorResponse {
  const { reply, suggestions } = extractSuggestions(raw)

  // Модель інколи відповідає САМИМ рядком >>> без тексту. Після зрізання
  // чіпсів лишається порожній рядок → клієнт малює порожню бульбашку, вона
  // потрапляє в історію, і наступного ходу модель не розуміє, що вже казала.
  // Порожній reply із чіпсами замінюємо на нейтральну підводку.
  if (!reply && suggestions?.length) {
    return { kind: 'message', reply: PICK_ONE[ctx.lang], suggestions }
  }
  if (suggestions?.length) return { kind: 'message', reply, suggestions }

  // Страховка фото-чіпсів — ЛИШЕ для чистого фото-кроку: якщо в повідомленні
  // є інші питання (рядки «— »), чіпси фото туди підставляти не можна.
  //
  // ⚠️ \p{L}*, а не \w*: \w в JS — це [A-Za-z0-9_], тож на кирилиці він
  // матчив ПОРОЖНІЙ рядок, після чого \s+ упирався в «и» від «додати» —
  // і обидві гілки не спрацьовували ЖОДНОГО разу. Страховка існувала лише
  // на папері, а крок 6 (фото) міг лишитись без кнопок, і клієнт мусив
  // друкувати відповідь руками на останньому кроці перед заявкою.
  if (
    /(додат|добав)\p{L}*\s+фото|add\s+(a\s+)?photos?|кнопк\p{L}*\s*«?\+/iu.test(
      reply,
    ) &&
    !/^—\s/m.test(reply)
  ) {
    return { kind: 'message', reply, suggestions: PHOTO_CHIPS[ctx.lang] }
  }

  // Закрите питання воронки без кнопок (дата, кімнати, сторона миття).
  const fallback = questionChips(reply, ctx)
  return fallback
    ? { kind: 'message', reply, suggestions: fallback }
    : { kind: 'message', reply }
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

// Слова-маркери: часті службові слова, унікальні для однієї мови.
// Чіпси («Після ремонту», «Так, треба вивезти») містять українські
// літери, тому детект по літерах їх плутав із мовою клієнта. Живі
// російські репліки («привет», «нужно», «этаж») таких слів не мають —
// рахуємо сигнали по обох мовах, перемагає більшість.
//
// ⚠️ Межа слова — ЛИШЕ через \p{L}, ніколи не через \b. У JavaScript «слово»
// для \b — це [A-Za-z0-9_], тож у суцільно кириличному рядку межі слова
// немає НІДЕ: регекс із \b виглядав робочим і не спрацьовував жодного разу.
// Механізм маркерів був мертвий, а детект мовчки деградував рівно до
// підрахунку літер — тобто до того самого, що маркери й мали виправити.
const BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}_])'
const BOUNDARY_AFTER = '(?![\\p{L}\\p{N}_])'

const marker = (words: string) =>
  new RegExp(`${BOUNDARY_BEFORE}(${words})${BOUNDARY_AFTER}`, 'giu')

// Назви послуг — лише російські («химчистка», «после»): «Химчистка дивана»
// не мала жодного маркера, нічия віддавала українській, і росіянин отримував
// українську відповідь. Українських підписів кнопок у UK_MARKERS навмисно
// немає: поки мову не впізнано, росіянин бачить і тисне саме їх.
const RU_MARKERS = marker(
  'привет|нужно|нужна|нужен|надо|можно|этаж|есть|да|нет|спасибо|пожалуйста|мне|расскажи|если|квартира|окна|убрать|уборка|уборку|сколько|который|очень|ещё|еще|хорошо|числа?|химчистка|химчистку|после|помыть|генеральная|генеральную|обычная|обычную',
)
const UK_MARKERS = marker(
  'привіт|потрібно|потрібна|потрібен|треба|можна|поверх|є|так|ні|дякую|будь ласка|мені|розкажи|якщо|квартира|вікна|прибрати|прибирання|скільки|який|дуже|ще|добре|числа?',
)
const UK_LETTERS = /[іїєґ]/g
const RU_LETTERS = /[ыэъё]/g
const CYRILLIC = /\p{Script=Cyrillic}/gu
const LATIN = /[a-z]/gi

/**
 * Підставні кнопки — мовою розмови. Українські «Додати фото» в російському
 * діалозі виглядали як збій, а англомовному клієнтові були незрозумілі.
 */
const PHOTO_CHIPS: Record<DialogLang, string[]> = {
  uk: ['Додати фото', 'Продовжити без фото'],
  ru: ['Добавить фото', 'Продолжить без фото'],
  en: ['Add photos', 'Continue without photos'],
}
const PICK_ONE: Record<DialogLang, string> = {
  uk: 'Оберіть варіант:',
  ru: 'Выберите вариант:',
  en: 'Pick an option:',
}

/**
 * Англійська — коли клієнт пише латиницею: іноземці в Одесі теж
 * замовляють прибирання, а відповідь російською для них — глухий кут.
 * Поріг у літерах відсікає одиничні «ok» і «m2» у кириличній репліці.
 */
const LATIN_MIN = 12

function detectLang(history: ZunorClientMessage[]): DialogLang {
  let ru = 0
  let uk = 0
  let latin = 0
  let cyrillic = 0
  for (const m of history) {
    if (m.role !== 'user') continue
    ru += (m.content.match(RU_MARKERS)?.length ?? 0) * 2
    uk += (m.content.match(UK_MARKERS)?.length ?? 0) * 2
    ru += m.content.match(RU_LETTERS)?.length ?? 0
    uk += m.content.match(UK_LETTERS)?.length ?? 0
    latin += m.content.match(LATIN)?.length ?? 0
    cyrillic += m.content.match(CYRILLIC)?.length ?? 0
  }
  if (latin >= LATIN_MIN && latin > cyrillic) return 'en'
  // Нічия («Розкажи анекдот» без жодного маркера) — українська: продукт
  // український, і російська відповідь на українську репліку дратує
  // більше, ніж навпаки.
  return ru > uk ? 'ru' : 'uk'
}

function baseMessages(
  history: ZunorClientMessage[],
  city: string | null,
  aiProfile: unknown = null,
) {
  // Детект послуги — по ПОВНІЙ історії: послуга могла бути названа на
  // початку, який уже випав з вікна MAX_HISTORY. LLM отримує хвіст,
  // але ФОКУС-блок у промпті має лишатися стабільним до кінця воронки.
  const ctx: TurnContext = {
    lang: detectLang(history),
    service: detectActiveService(history),
    premiseKnown: premiseMentioned(
      history.filter((m) => m.role === 'user').map((m) => m.content),
    ),
  }
  const messages: DsMessage[] = [
    {
      role: 'system',
      content: buildSystemPrompt(city, ctx.service, ctx.lang, aiProfile),
    },
    ...trimHistory(history).map(
      (m): DsMessage => ({ role: m.role, content: m.content }),
    ),
  ]
  return { messages, ctx }
}

// ─────────────────────── Драфт: валідація + ретраї ───────────────────────
// Викликається і зі стріму (tool_start), і з синхронного шляху.
// Драфт клієнт НЕ бачить до успішної валідації, тому все синхронне.

/**
 * Заявку читає майстер в українському інтерфейсі, тож title і description
 * — українською, хоч би якою мовою йшла розмова. У російському діалозі
 * модель інколи писала їх російською («Ковер 3×4 м. Есть собака»).
 *
 * Рахунок як у detectLang: слова-маркери й літери обох мов. Самих літер
 * ы/э/ъ/ё мало — у прикладі вище їх немає жодної. А «немає і/ї/є/ґ» —
 * хибний сигнал: «Прибирання квартири» чи «Площа 50 м², два санвузли» —
 * чиста українська без жодної з них.
 */
const RU_COPY = marker(
  'и|есть|это|что|нужно|надо|площадь|санузел|санузла|санузлов|комнаты|комнат|уборка|уборки|окна|пятна|ковер|ковёр|животные|животных',
)
const UK_COPY = marker(
  'і|й|є|прибирання|площа|санвузол|санвузли|кімнати|кімнат|вікна|плями|килим|тварини|тварин|потрібно|треба',
)

function russianCopy(title: unknown, description: unknown): string | null {
  const text = `${typeof title === 'string' ? title : ''} ${typeof description === 'string' ? description : ''}`
  const ru =
    (text.match(RU_COPY)?.length ?? 0) * 2 +
    (text.match(RU_LETTERS)?.length ?? 0)
  const uk =
    (text.match(UK_COPY)?.length ?? 0) * 2 +
    (text.match(UK_LETTERS)?.length ?? 0)
  return ru > uk
    ? 'title і description написані російською, а мають бути українською.'
    : null
}

async function resolveDraft(
  messages: DsMessage[],
  tool: DsTool,
  firstText: string,
  firstCall: DsToolCall,
  ctx: TurnContext,
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
      // Мова заявки — лише ОДНА спроба виправити: через мову клієнт не має
      // застрягнути без заявки, тож другий російський варіант приймаємо.
      const copyError =
        round === 0 ? russianCopy(rawTitle, rawDescription) : null
      turnLog().validation(
        validation.ok && !copyError,
        validation.error ?? copyError ?? undefined,
      )

      if (validation.ok && validation.clean && !copyError) {
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
        content: copyError
          ? `Помилка: ${copyError} Виклич інструмент ще раз із тими самими даними, переклавши title і description українською.`
          : `Помилка валідації: ${validation.error ?? 'невідома'}. Виправ дані (звір дату з календарем із системних інструкцій) і виклич інструмент ще раз, або постав клієнту ОДНЕ уточнююче питання.`,
      })
    }

    // Ретрай — ЗАВЖДИ без thinking: інакше 400 через відсутній
    // reasoning_content у tool-ланцюгу (обмеження описане в deepseek.ts).
    const res = await chatCompletion(messages, [tool], false)
    const msg = res.choices[0]?.message
    if (!msg) break
    text = (msg.content ?? '').trim()
    call = msg.tool_calls?.find((c) => c.function.name === TOOL_NAME) ?? null

    // Текст замість драфта — це питання клієнту, віддаємо
    if (!call && text) return toMessage(text, ctx)
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
  aiProfile: unknown = null,
  signal?: AbortSignal,
): Promise<ZunorResponse> {
  const tool = buildTool()
  const { messages, ctx } = baseMessages(history, city, aiProfile)

  turnLog().setup({ service: ctx.service, tool })

  const stream = chatCompletionStream(messages, [tool], true, signal)
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
    return resolveDraft(messages, tool, content, toolCall, ctx)
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
  return toMessage(raw, ctx)
}

// ─────────────────────── Синхронний хід (фолбек) ───────────────────────

export async function runZunorTurn(
  history: ZunorClientMessage[],
  city: string | null,
  aiProfile: unknown = null,
): Promise<ZunorResponse> {
  const tool = buildTool()
  const { messages, ctx } = baseMessages(history, city, aiProfile)

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
      return toMessage(raw, ctx)
    }

    return resolveDraft(messages, tool, (msg.content ?? '').trim(), call, ctx)
  }

  return {
    kind: 'message',
    reply:
      'Мені бракує деталей. Уточни, будь ласка: що саме прибираємо і коли?',
  }
}
