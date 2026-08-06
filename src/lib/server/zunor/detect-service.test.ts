import { describe, it, expect } from 'vitest'
import { detectActiveService } from './detect-service'
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

  it('порожня історія → null', () => {
    expect(detectActiveService([])).toBeNull()
  })

  it('розмова без згадки послуги → null', () => {
    expect(detectActiveService([user('Привіт, скільки це коштує?')])).toBeNull()
  })
})

describe('скан з кінця історії', () => {
  it('перемагає остання названа послуга — клієнт передумав', () => {
    const history = [
      user('Потрібне генеральне прибирання'),
      bot('Скільки кімнат?'),
      user('Хоча ні, спочатку помийте вікна'),
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
