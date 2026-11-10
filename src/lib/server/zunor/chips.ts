// Страховка кнопок на закритих питаннях воронки.
//
// Кнопки малює модель рядком «>>>», і на питаннях з готовими відповідями
// вона його регулярно губить: «На яку дату?» приходить без кнопок, і клієнт
// друкує «завтра» руками там, де мав бути один натиск. Якщо повідомлення
// закінчується впізнаним закритим питанням, а кнопок немає — ставимо свої,
// мовою розмови.
//
// Дивимось лише ОСТАННЄ питання і лише коли воно одне за змістом:
// «Скільки кімнат і коли?» кнопок не отримує — будь-який набір відповідав
// би на половину питання. Список «— …» (крок 5) — теж ні: там кілька питань.
//
// ⚠️ Межі слова — через \p{L}, не \b: у JS \b не бачить кирилиці (AGENTS.md).

import {
  FREQUENCY_OPTIONS,
  PREMISES,
  SERVICES,
  WINDOW_SIDE_OPTIONS,
} from '$lib/categories/cleaning/presets'
import type { DialogLang } from './prompt'
import type { ServiceKey } from './service-rules'

type Translations = Record<Exclude<DialogLang, 'uk'>, Record<string, string>>

/** Українські підписи — з пресетів (як у формі), решта мов — переклад за ключем. */
function labels(
  options: ReadonlyArray<{ key: string; label: string }>,
  tr: Translations,
  lang: DialogLang,
): string[] {
  return options.map((o) =>
    lang === 'uk' ? o.label : (tr[lang][o.key] ?? o.label),
  )
}

const PREMISE_TR: Translations = {
  ru: {
    apartment: 'Квартира',
    house: 'Дом',
    office: 'Офис',
    commercial: 'Коммерческое',
    other: 'Другое',
  },
  en: {
    apartment: 'Apartment',
    house: 'House',
    office: 'Office',
    commercial: 'Commercial',
    other: 'Other',
  },
}

// Підписи мусить впізнавати detect-service: натиснута кнопка задає фокус.
const SERVICE_TR: Translations = {
  ru: {
    standard: 'Обычная',
    deep: 'Генеральная',
    'post-renovation': 'После ремонта',
    windows: 'Мойка окон',
    sofa: 'Химчистка',
    regular: 'Регулярная',
  },
  en: {
    standard: 'Standard',
    deep: 'Deep cleaning',
    'post-renovation': 'After renovation',
    windows: 'Window washing',
    sofa: 'Dry cleaning',
    regular: 'Regular',
  },
}

const WINDOW_SIDE_TR: Translations = {
  ru: { inside: 'Изнутри', outside: 'Снаружи', both: 'С двух сторон' },
  en: { inside: 'Inside', outside: 'Outside', both: 'Both sides' },
}

const FREQUENCY_TR: Translations = {
  ru: {
    daily: 'Каждый день',
    weekly: 'Раз в неделю',
    biweekly: 'Раз в 2 недели',
    monthly: 'Раз в месяц',
  },
  en: {
    daily: 'Daily',
    weekly: 'Weekly',
    biweekly: 'Every 2 weeks',
    monthly: 'Monthly',
  },
}

// Ті самі слова, що в правилі послуги (service-rules.ts), а не підписи
// TRASH_OPTIONS: «Потрібно винести сміття» задовге для кнопки.
const TRASH_CHIPS: Record<DialogLang, string[]> = {
  uk: ['Треба винести', 'Вже винесене'],
  ru: ['Нужно вынести', 'Уже вынесли'],
  en: ['Needs removal', 'Already removed'],
}

const ROOM_CHIPS = ['1', '2', '3', '4+']

// ─── Дата ───

const LOCALES: Record<DialogLang, string> = {
  uk: 'uk-UA',
  ru: 'ru-RU',
  en: 'en-US',
}
const NEAR_DAYS: Record<DialogLang, string[]> = {
  uk: ['Завтра', 'Післязавтра'],
  ru: ['Завтра', 'Послезавтра'],
  en: ['Tomorrow'],
}
const DATE_CHIPS = 5

/**
 * «Завтра | Післязавтра | Четвер | Пʼятниця | Субота»: далі за
 * післязавтра — назви днів тижня. П'ять днів поспіль майже завжди
 * захоплюють суботу, а найближчий день із такою назвою модель знаходить
 * за календарем із промпту.
 */
export function dateChips(lang: DialogLang, now = new Date()): string[] {
  const chips = [...NEAR_DAYS[lang]]
  for (let day = chips.length + 1; chips.length < DATE_CHIPS; day++) {
    const name = new Date(now.getTime() + day * 86_400_000).toLocaleDateString(
      LOCALES[lang],
      { timeZone: 'Europe/Kyiv', weekday: 'long' },
    )
    chips.push(name.charAt(0).toLocaleUpperCase(LOCALES[lang]) + name.slice(1))
  }
  return chips
}

// ─── Впізнавання питання ───

const BEFORE = '(?<![\\p{L}\\p{N}_])'
const AFTER = '(?![\\p{L}\\p{N}_])'
const re = (src: string) => new RegExp(`${BEFORE}(?:${src})`, 'iu')

/** Що відомо про розмову: від цього залежить, як читати питання. */
export interface ChipContext {
  lang: DialogLang
  service: ServiceKey | null
  /** Клієнт уже назвав помешкання — «Що прибираємо?» тоді не про нього. */
  premiseKnown: boolean
}

interface Ask {
  chips: (lang: DialogLang, now: Date) => string[]
  test: RegExp
  /** Слова, з якими це вже інше або складене питання. */
  not?: RegExp
  /** Лише в такій розмові: «зовні» поза миттям вікон — не про сторону. */
  only?: (ctx: ChipContext) => boolean
}

const premise = (lang: DialogLang) => labels(PREMISES, PREMISE_TR, lang)

// Слова-помешкання. Короткі — цілим словом: корінь «дом» ловив би «дома»
// в «кіт дома», і помешкання вважалось би вже названим.
const PREMISE_WORDS = `квартир|будин|котедж|коттедж|офіс|офис|магазин|вітрин|витрин|комерц|коммерч|apartment|house|office|shop|store|commercial|(дім|дом|хата|хату|хати|flat)${AFTER}`
const PREMISE_NAMED = re(PREMISE_WORDS)

/** Чи називав клієнт помешкання (будь-якою мовою чи кнопкою). */
export function premiseMentioned(userTexts: readonly string[]): boolean {
  return userTexts.some((t) => PREMISE_NAMED.test(t))
}

const IN = 'зсередини|изнутри|inside'
const OUT = 'ззовні|зовні|снаружи|outside'

const SOFA_SHAPE: Record<DialogLang, string[]> = {
  uk: ['Прямий', 'Кутовий'],
  ru: ['Прямой', 'Угловой'],
  en: ['Straight', 'Corner'],
}
const STRAIGHT = 'прям\\p{L}*|straight'
const CORNER = 'кутов|углов|corner'

const ASKS: Ask[] = [
  {
    chips: premise,
    test: re(
      `(тип|вид)\\s+(помешкання|приміщення|помещения|обʼєкта|об'єкта|объекта)|що\\s+(це\\s+)?за\\s+(помешкання|приміщення|обʼєкт|об'єкт)|что\\s+(это\\s+)?за\\s+(помещение|объект)|what\\s+((kind|type)\\s+of\\s+)?(place|property|premises)|де\\s+(будемо\\s+)?(прибира|чист|ми[тю])|где\\s+(будем\\s+)?(убира|чист|мо[ею]|мыть)` +
        // «Квартира чи будинок?», ««хата» — это квартира или дом?»
        `|(${PREMISE_WORDS})[^?]*(${PREMISE_WORDS})`,
    ),
  },
  {
    // «Що прибираємо?» і «Где он находится?» — про помешкання, лише поки
    // його не названо. Далі так питають про зону чи предмети.
    chips: premise,
    test: re(
      'що\\s+((саме|будемо)\\s+)?прибира|що\\s+(потрібно|треба)\\s+прибрати|что\\s+((именно|будем)\\s+)?убира|что\\s+(нужно|надо)\\s+убрать|what\\s+(needs|do\\s+you\\s+need|would\\s+you\\s+like)\\s+(to\\s+be\\s+|to\\s+)?clean|(де|где)\\s+(він|вона|воно|вони|он|она|оно|они)\\s+(знаход|наход)',
    ),
    only: (ctx) => !ctx.premiseKnown,
  },
  {
    chips: (lang) => labels(SERVICES, SERVICE_TR, lang),
    test: re(
      '(яке|який|яка|яку|какое|какая|какую|какой|what)\\s+((саме|именно|тип|вид|kind|type|of)\\s+)*(прибиран|уборк|cleaning)|(що|что)\\s+за\\s+(прибиран|уборк)|як\\p{L}*\\s+послуг|как\\p{L}*\\s+услуг|what\\s+service',
    ),
  },
  {
    chips: () => ROOM_CHIPS,
    test: re(
      '(скільки|сколько|how\\s+many)[^?]{0,25}(кімнат|комнат|rooms|bedrooms)|(кількість|количество)\\s+(кімнат|комнат)',
    ),
    not: re('санвуз|санузл|bathroom|площ|area|балкон|balcon'),
  },
  {
    chips: dateChips,
    // «дат[ауеы]», без «дати»: українське «дати» — це ще й «дати ключі».
    test: re(
      `дат[ауеы]${AFTER}|(коли|когда|when)${AFTER}|(який|якого|яке|какой|какого|what|which)\\s+(день|дня|число|числа|date|day)`,
    ),
    // Час доби, давність і частота — не дата: «Коли зручно — зранку чи
    // ввечері?» з кнопками «Завтра | Четвер» звучало б як збій.
    not: re(
      'годин|котр|время|времени|во\\s+сколько|what\\s+time|зран|ранк|утр|вечер|вечор|morning|evening|afternoon|востаннє|последн|last\\s+time|як\\s+часто|как\\s+часто|how\\s+often',
    ),
  },
  {
    chips: (lang) => labels(WINDOW_SIDE_OPTIONS, WINDOW_SIDE_TR, lang),
    // Обидві сторони поруч або пряме «з якого боку». Одне слово не рахується:
    // «що стоїть впритул до скла inside?» — про викладку, не про сторону.
    test: re(
      `(${IN})[^?]*(${OUT})|(${OUT})[^?]*(${IN})|з\\s+якого\\s+боку|з\\s+яких\\s+боків|с\\s+какой\\s+стороны|с\\s+каких\\s+сторон|which\\s+side`,
    ),
    // «Як дістатися ззовні з 7 поверху?» — про доступ, а не про сторону.
    not: re(
      'поверх|этаж|floor|драбин|лестниц|ladder|альпін|альпин|climb|дістат|достать|доступ|reach|access|балкон|лоджі|лоджи|balcon',
    ),
    only: (ctx) => ctx.service === 'windows',
  },
  {
    chips: (lang) => TRASH_CHIPS[lang],
    test: re('смітт|мусор|debris|trash|rubbish|waste'),
    // «Скільки мішків і чи є ліфт?» — це вже крок 5, а не «чи лишилось».
    not: re(
      'скільки|сколько|how\\s+much|how\\s+many|мішк|мешк|bags?|поверх|этаж|floor|ліфт|лифт|elevator|lift',
    ),
    only: (ctx) => ctx.service === 'post-renovation',
  },
  {
    chips: (lang) => labels(FREQUENCY_OPTIONS, FREQUENCY_TR, lang),
    test: re(
      'як\\s+часто|как\\s+часто|how\\s+often|частот|frequency|періодичн|периодичн',
    ),
  },
  {
    chips: (lang) => SOFA_SHAPE[lang],
    test: re(`(${STRAIGHT})[^?]*(${CORNER})|(${CORNER})[^?]*(${STRAIGHT})`),
    only: (ctx) => ctx.service === 'sofa',
  },
]

/** Останнє речення з «?» — або null, якщо питань кілька списком. */
function lastQuestion(reply: string): string | null {
  if (/^(—|\d+\.)\s/m.test(reply)) return null
  const end = reply.lastIndexOf('?')
  if (end === -1) return null
  const head = reply.slice(0, end)
  const start =
    Math.max(
      head.lastIndexOf('?'),
      head.lastIndexOf('!'),
      head.lastIndexOf('.'),
      head.lastIndexOf('\n'),
    ) + 1
  return reply.slice(start, end + 1)
}

/**
 * Кнопки для закритого питання, на якому модель їх не поставила.
 * undefined — питання відкрите, складене або не впізнане.
 */
export function questionChips(
  reply: string,
  ctx: ChipContext,
  now = new Date(),
): string[] | undefined {
  const question = lastQuestion(reply)
  if (!question) return undefined

  const hits = new Set(
    ASKS.filter(
      (a) =>
        (!a.only || a.only(ctx)) &&
        a.test.test(question) &&
        !a.not?.test(question),
    ).map((a) => a.chips),
  )
  if (hits.size !== 1) return undefined
  const [chips] = hits
  return chips(ctx.lang, now)
}
