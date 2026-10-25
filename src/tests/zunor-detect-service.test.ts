import { describe, it, expect } from 'vitest'
import { detectActiveService } from '$lib/server/zunor/detect-service'
import type { ZunorClientMessage } from '$lib/types/zunor'

// Детект послуги задає ФОКУС промпту. Помилка тут не ламає заявку
// (metadata все одно валідується), але веде діалог не туди: клієнт
// говорить про вікна, а асистент питає про кімнати.

const user = (content: string): ZunorClientMessage => ({
  role: 'user',
  content,
})
const bot = (content: string): ZunorClientMessage => ({
  role: 'assistant',
  content,
})

describe('базовий детект', () => {
  it('впізнає послугу за назвою кнопки', () => {
    expect(detectActiveService([user('Миття вікон')])).toBe('windows')
    expect(detectActiveService([user('Генеральне')])).toBe('deep')
    expect(detectActiveService([user('Після ремонту')])).toBe('post-renovation')
  })

  // «Обычная уборка» не впізнавалась узагалі: синонімами «Звичайного» були
  // лише «підтримуюче/поддерживающая». Без фокусу модель питала балкон і
  // забруднення, а площу й алергію губила.
  it('звичайне прибирання впізнається обома мовами', () => {
    expect(detectActiveService([user('Нужна обычная уборка квартиры')])).toBe(
      'standard',
    )
    expect(detectActiveService([user('Хочу обычную уборку')])).toBe('standard')
    // Кнопку модель пише в будь-якому роді: «Обычное» лишало розмову без
    // фокусу, і агент питав поверх, ліфт і сміття для звичайного прибирання.
    expect(detectActiveService([user('Обычное')])).toBe('standard')
    expect(detectActiveService([user('Треба звичайне прибирання')])).toBe(
      'standard',
    )
  })

  // Корінь «звичайн»/«обычн» ловив би «звичайно»/«обычно» в будь-якій
  // відповіді й перемикав генеральне на звичайне посеред розмови.
  it('«звичайно» й «обычно» у відповіді не збивають фокус', () => {
    expect(
      detectActiveService([
        user('Генеральне прибирання'),
        bot('Чи є тварини?'),
        user('Звичайно, є кіт'),
      ]),
    ).toBe('deep')
    expect(
      detectActiveService([
        user('Генеральная уборка'),
        bot('Есть животные?'),
        user('Обычно кот дома'),
      ]),
    ).toBe('deep')
  })

  // Англомовний клієнт (детект мови → en) лишався без фокусу послуги, і
  // модель питала про поверх і сміття для регулярного прибирання.
  it('англійські назви послуг теж впізнаються', () => {
    expect(detectActiveService([user('Regular')])).toBe('regular')
    expect(detectActiveService([user('I need my windows washed')])).toBe(
      'windows',
    )
    expect(detectActiveService([user('Carpet dry cleaning please')])).toBe(
      'sofa',
    )
    expect(detectActiveService([user('Cleaning after renovation')])).toBe(
      'post-renovation',
    )
  })

  // «ковер» не збігався з «ковёр» (ё ≠ е), а «ковра»/«ковров» не ловились.
  it('ковёр з «ё» і в будь-якій формі — хімчистка', () => {
    for (const text of ['Химчистка ковра', 'почистить ковёр', 'два ковра']) {
      expect(detectActiveService([user(text)])).toBe('sofa')
    }
  })

  it('порожня історія → null', () => {
    expect(detectActiveService([])).toBeNull()
  })

  it('розмова без згадки послуги → null', () => {
    expect(detectActiveService([user('Привіт, скільки це коштує?')])).toBeNull()
  })
})

describe('обрана послуга тримається', () => {
  it('перемагає остання названа послуга — клієнт передумав', () => {
    const history = [
      user('Потрібне генеральне прибирання'),
      bot('Скільки кімнат?'),
      user('Хоча ні, спочатку помийте вікна'),
    ]
    expect(detectActiveService(history)).toBe('windows')
  })

  // Регресія з прогону діалогів: «вікна теж» у відповіді про роботи понад
  // стандарт перемикало генеральне на «Миття вікон», і агент вимагав
  // кількість вікон як обовʼязкове поле, доки клієнт не здавався.
  it('допрацює в межах послуги не перемикає її', () => {
    const deep = [user('Генеральне прибирання'), bot('Що понад стандарт?')]

    for (const answer of [
      'Духовку і холодильник помити, вікна теж хотілося б',
      'Ні, тварин немає, а вікна ще помити',
      'И окна заодно',
    ]) {
      expect(detectActiveService([...deep, user(answer)])).toBe('deep')
    }
  })

  it('відповідь «скільки вікон» усередині генерального — не вибір', () => {
    const deep = [user('Генеральне прибирання'), bot('Скільки вікон?')]

    expect(detectActiveService([...deep, user('5 вікон')])).toBe('deep')
    expect(detectActiveService([...deep, user('пʼять вікон')])).toBe('deep')
  })

  it('натиснута кнопка з назвою послуги — це новий вибір', () => {
    const history = [
      user('Генеральне прибирання'),
      bot('Можу запропонувати ще миття вікон'),
      user('Миття вікон'),
    ]
    expect(detectActiveService(history)).toBe('windows')
  })

  it('«лучше» без «тоже» — клієнт передумав', () => {
    const history = [
      user('Генеральная уборка'),
      bot('Сколько комнат?'),
      user('Давайте лучше помоем окна'),
    ]
    expect(detectActiveService(history)).toBe('windows')
  })

  it('коротка відповідь не збиває фокус, узятий раніше', () => {
    const history = [user('Миття вікон'), bot('Скільки вікон?'), user('П’ять')]
    expect(detectActiveService(history)).toBe('windows')
  })
})

describe('джерело тексту', () => {
  it('повідомлення асистента не рахуються', () => {
    // Інакше питання бота «а може, генеральне?» перемикало б фокус саме.
    const history = [
      user('Помийте вікна'),
      bot('Може, вам потрібне генеральне прибирання?'),
    ]
    expect(detectActiveService(history)).toBe('windows')
  })
})

describe('нормалізація', () => {
  it('регістр не має значення', () => {
    expect(detectActiveService([user('МИТТЯ ВІКОН')])).toBe('windows')
  })

  it('різні апострофи ловляться однаково', () => {
    const variants = ["п'ять вікон", 'п’ять вікон', 'п`ять вікон']
    for (const v of variants) {
      expect(detectActiveService([user(`Треба ${v}, миття вікон`)])).toBe(
        'windows',
      )
    }
  })
})

describe('межі слова', () => {
  it('збіг лише на початку слова', () => {
    // 'вікон' усередині іншого слова не має вмикати фокус вікон.
    expect(detectActiveService([user('підвіконня треба протерти')])).not.toBe(
      'windows',
    )
  })
})

describe('кілька послуг в одному повідомленні', () => {
  it('виграє названа першою', () => {
    const result = detectActiveService([
      user('Миття вікон, а потім генеральне прибирання'),
    ])
    expect(result).toBe('windows')
  })
})

// Корінь «окн»/«вікн» не ловить «окон»/«вікон»: кнопка «Мойка окон», яку
// модель сама ставить у російському діалозі, лишала розмову без фокусу.
describe('родовий відмінок вікон', () => {
  it('«окон» і «вікон» — миття вікон', () => {
    expect(detectActiveService([user('Мойка окон')])).toBe('windows')
    expect(detectActiveService([user('Помийте пʼять вікон')])).toBe('windows')
  })
})
