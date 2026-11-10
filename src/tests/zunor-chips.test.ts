import { describe, it, expect } from 'vitest'
import {
  dateChips,
  premiseMentioned,
  questionChips,
  type ChipContext,
} from '$lib/server/zunor/chips'
import { detectActiveService } from '$lib/server/zunor/detect-service'
import { SERVICES } from '$lib/categories/cleaning/presets'

// Страховка кнопок: модель губить рядок «>>>» на закритих питаннях, і
// клієнт друкує «завтра» руками. Перевіряємо дві речі: впізнане закрите
// питання отримує кнопки, а відкрите чи складене — НІ. Друге важливіше:
// кнопки «Завтра | Четвер» під питанням «зранку чи ввечері?» — це збій,
// гірший за їх відсутність.

// Понеділок, 26 жовтня 2026, ранок за Києвом.
const MONDAY = new Date('2026-10-26T08:00:00Z')

const ask = (
  reply: string,
  lang: ChipContext['lang'] = 'uk',
  service: ChipContext['service'] = null,
  premiseKnown = false,
) => questionChips(reply, { lang, service, premiseKnown }, MONDAY)

describe('кнопки дати', () => {
  it('завтра, післязавтра, далі назви днів — мовою розмови', () => {
    expect(dateChips('uk', MONDAY)).toEqual([
      'Завтра',
      'Післязавтра',
      'Четвер',
      'Пʼятниця',
      'Субота',
    ])
    expect(dateChips('ru', MONDAY)).toEqual([
      'Завтра',
      'Послезавтра',
      'Четверг',
      'Пятница',
      'Суббота',
    ])
    expect(dateChips('en', MONDAY)).toEqual([
      'Tomorrow',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ])
  })

  // Сервер може жити в UTC: о 00:30 за Києвом там ще вчора, і «завтра»
  // вказувало б на сьогодні.
  it('день рахується за Києвом, а не за годинником сервера', () => {
    const afterMidnightKyiv = new Date('2026-10-26T22:30:00Z') // вівторок 00:30
    expect(dateChips('uk', afterMidnightKyiv)[2]).toBe('Пʼятниця')
  })
})

describe('закрите питання отримує кнопки', () => {
  it('дата — у будь-якому формулюванні', () => {
    const uk = dateChips('uk', MONDAY)
    const ru = dateChips('ru', MONDAY)
    expect(
      ask('Зрозумів, 2 кімнати. На яку дату потрібне прибирання?'),
    ).toEqual(uk)
    expect(ask('Коли зручно, щоб майстер прийшов?')).toEqual(uk)
    // Обидва — із живих прогонів, де кнопок не було.
    expect(
      ask('Понял, однокомнатная. На какую дату планируете уборку?', 'ru'),
    ).toEqual(ru)
    expect(
      ask(
        'Записал: один ковёр 3×4 м.\n\nКогда планируете чистку?',
        'ru',
        'sofa',
      ),
    ).toEqual(ru)
    expect(
      ask('When would you like the windows washed?', 'en', 'windows'),
    ).toEqual(dateChips('en', MONDAY))
  })

  it('кімнати', () => {
    expect(ask('Скільки кімнат у квартирі?')).toEqual(['1', '2', '3', '4+'])
    expect(ask('Понял, квартира. Сколько у вас комнат?', 'ru')).toEqual([
      '1',
      '2',
      '3',
      '4+',
    ])
  })

  it('сторона миття — лише для миття вікон', () => {
    const q = 'Should we wash them from the inside, the outside, or both?'
    expect(ask(q, 'en', 'windows')).toEqual(['Inside', 'Outside', 'Both sides'])
    expect(ask('Мити зсередини чи ззовні?', 'uk', 'windows')).toEqual([
      'Зсередини',
      'Ззовні',
      'З двох боків',
    ])
    expect(ask(q, 'en', 'deep')).toBeUndefined()
  })

  it('помешкання й послуга', () => {
    expect(ask('Понял. Что за помещение нужно убрать?', 'ru')).toEqual([
      'Квартира',
      'Дом',
      'Офис',
      'Коммерческое',
      'Другое',
    ])
    // Суржик із живого прогону: «прибирание» з одним «н».
    expect(ask('Понял, квартира. Какое прибирание нужно?', 'ru')).toEqual([
      'Обычная',
      'Генеральная',
      'После ремонта',
      'Мойка окон',
      'Химчистка',
      'Регулярная',
    ])
  })

  it('помешкання — у формулюваннях із живих прогонів', () => {
    for (const q of [
      'Got it — regular cleaning. What place are we cleaning?',
      'Отлично, окна. Что мыть — квартиру, дом или что-то другое?',
      'Уточню: «хата» — это квартира или дом?',
    ]) {
      expect(ask(q, 'ru')).toHaveLength(5)
    }
  })

  // Клієнт часто починає з послуги («Нужна генеральная уборка»), і питання
  // про помешкання приходить уже ПІСЛЯ неї. Тому межа — названо помешкання
  // чи ні, а не обрано послугу чи ні.
  it('«Що прибираємо?» — про помешкання, лише поки його не названо', () => {
    expect(ask('Привіт! Що прибираємо?')).toHaveLength(5)
    expect(
      ask('Понял, генеральная уборка. Что нужно убрать?', 'ru', 'deep'),
    ).toHaveLength(5)
    expect(
      ask('Понял, химчистка дивана. Где он находится?', 'ru', 'sofa'),
    ).toHaveLength(5)
    expect(ask('Добре. Що прибираємо?', 'uk', 'deep', true)).toBeUndefined()
  })

  it('форма дивана — лише для хімчистки', () => {
    expect(
      ask('Зрозумів, квартира. Диван прямий чи кутовий?', 'uk', 'sofa'),
    ).toEqual(['Прямий', 'Кутовий'])
    expect(ask('Диван прямой или угловой?', 'ru', 'deep')).toBeUndefined()
  })

  it('сміття після ремонту і частота', () => {
    expect(
      ask('Чи залишилось будівельне сміття?', 'uk', 'post-renovation'),
    ).toEqual(['Треба винести', 'Вже винесене'])
    expect(ask('Як часто потрібне прибирання?', 'uk', 'regular')).toEqual([
      'Щодня',
      'Раз на тиждень',
      'Раз на 2 тижні',
      'Раз на місяць',
    ])
  })
})

describe('відкрите чи складене питання кнопок не отримує', () => {
  it('відкриті питання', () => {
    expect(ask('Яка приблизно площа квартири?')).toBeUndefined()
    expect(
      ask('Скільки вікон потрібно помити?', 'uk', 'windows'),
    ).toBeUndefined()
    expect(ask('Записав.')).toBeUndefined()
  })

  it('два питання в одному — кнопки відповідали б на половину', () => {
    expect(ask('Скільки кімнат і на яку дату?')).toBeUndefined()
    expect(ask('Скільки кімнат і санвузлів?')).toBeUndefined()
  })

  it('список питань кроку 5', () => {
    expect(
      ask('Ще кілька деталей:\n— яка площа?\n— коли зручно?'),
    ).toBeUndefined()
  })

  it('схожі слова в іншому питанні', () => {
    // Час доби — не дата.
    expect(ask('Коли зручно — зранку чи ввечері?')).toBeUndefined()
    expect(ask('Когда последний раз делали генеральную?', 'ru')).toBeUndefined()
    // «Ззовні» тут про доступ, а не про сторону миття.
    expect(
      ask(
        'How can the outside be reached from the 7th floor?',
        'en',
        'windows',
      ),
    ).toBeUndefined()
    // Із прогону: одне «inside» — про викладку біля скла, а не про сторону.
    expect(
      ask(
        'Is anything standing right up against the glass inside — shelving, goods?',
        'en',
        'windows',
      ),
    ).toBeUndefined()
    // Обсяг сміття — це вже крок 5.
    expect(
      ask('Скільки приблизно мішків сміття?', 'uk', 'post-renovation'),
    ).toBeUndefined()
    // «Дати» — ще й «дати ключі».
    expect(ask('Чи зможете дати майстру ключі?')).toBeUndefined()
  })
})

describe('чи назване помешкання', () => {
  it('будь-якою мовою чи кнопкою', () => {
    expect(premiseMentioned(['Квартира'])).toBe(true)
    expect(premiseMentioned(['Генеральне прибирання будинку'])).toBe(true)
    expect(premiseMentioned(['Шо там, нада убрать хату'])).toBe(true)
    expect(
      premiseMentioned(['Hi, we need the windows in our office cleaned']),
    ).toBe(true)
  })

  // Корінь «дом» ловив би «дома»: «Нужна генеральная, кот дома» — і питання
  // «Что нужно убрать?» лишалось би без кнопок.
  it('«дома» й послуга без помешкання — ще не назване', () => {
    expect(premiseMentioned(['Нужна генеральная уборка', 'Кот дома'])).toBe(
      false,
    )
    expect(premiseMentioned(['Химчистка дивана'])).toBe(false)
  })
})

// Натиснута кнопка задає фокус послуги. Підпис, якого не впізнає детект,
// лишав розмову без плану питань — так було з «Мойка окон».
describe('підписи послуг упізнає детект', () => {
  it.each(['uk', 'ru', 'en'] as const)('%s', (lang) => {
    const chips = ask('Яке прибирання потрібне?', lang) ?? []
    expect(chips).toHaveLength(SERVICES.length)
    chips.forEach((label, i) => {
      expect(detectActiveService([{ role: 'user', content: label }])).toBe(
        SERVICES[i]!.key,
      )
    })
  })
})
