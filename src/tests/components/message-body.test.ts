import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import MessageBody from '$lib/components/zunor/MessageBody.svelte'

// Другий бік мікроформату Zunor. Сервер у agent.ts нормалізує вивід моделі
// в протокол (порожній рядок = абзац, «— » = пункт списку), а цей компонент
// той протокол малює. Домовленість тримається на двох файлах одразу, і якщо
// один із них зміниться сам — користувач побачить сирі тире в тексті.
//
// Окремо: текст моделі — недовірений ввід. {@html} тут немає за побудовою,
// і тест це стереже: варто комусь «додати підтримку розмітки» — впаде.

const body = (text: string, typing = false) =>
  render(MessageBody, { props: { text, typing } })

describe('абзаци', () => {
  it('простий текст рендериться одним абзацом', () => {
    const { container } = body('Привіт! Чим допомогти?')

    const p = container.querySelectorAll('p')
    expect(p).toHaveLength(1)
    expect(p[0].textContent?.trim()).toBe('Привіт! Чим допомогти?')
  })

  it('порожній рядок ділить текст на абзаци', () => {
    const { container } = body('Перший абзац.\n\nДругий абзац.')

    const p = container.querySelectorAll('p')
    expect(p).toHaveLength(2)
    expect(p[1].textContent?.trim()).toBe('Другий абзац.')
  })

  // Один перенос — це просто перенос у межах думки, а не новий абзац:
  // модель ставить їх довільно, і абзац на кожен виглядав би рваним.
  it('одинарний перенос склеюється в один абзац', () => {
    const { container } = body('Перший рядок\nдругий рядок')

    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(container.querySelector('p')?.textContent?.trim()).toBe(
      'Перший рядок другий рядок',
    )
  })

  it('кілька порожніх рядків підряд не дають порожніх абзаців', () => {
    const { container } = body('Перший.\n\n\n\nДругий.')

    expect(container.querySelectorAll('p')).toHaveLength(2)
  })

  it('порожній текст не рендерить нічого зайвого', () => {
    const { container } = body('')

    expect(container.querySelectorAll('p')).toHaveLength(0)
    expect(container.querySelectorAll('ul')).toHaveLength(0)
  })

  it('текст із самих пробілів теж дає порожньо', () => {
    const { container } = body('   \n\n  \n ')

    expect(container.textContent?.trim()).toBe('')
  })
})

describe('списки', () => {
  it('рядки з «— » стають пунктами списку', () => {
    const { container } = body('— Перший\n— Другий\n— Третій')

    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(3)
    expect(items[0].textContent).toContain('Перший')
  })

  // Тире — це ПРОТОКОЛ, а не символ для показу: маркер малює компонент
  // крапкою кольору primary.
  it('саме тире в текст не потрапляє', () => {
    const { container } = body('— Прибирання квартири')

    expect(container.querySelector('li')?.textContent?.trim()).toBe(
      'Прибирання квартири',
    )
  })

  it('маркер — крапка, схована від скрінрідера', () => {
    const { container } = body('— Пункт')

    const dot = container.querySelector('li span[aria-hidden="true"]')
    expect(dot).not.toBeNull()
    expect(dot?.className).toContain('rounded-full')
  })

  it('абзац і список поруч не змішуються', () => {
    const { container } = body('Ось варіанти:\n— Перший\n— Другий')

    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(container.querySelectorAll('li')).toHaveLength(2)
  })

  it('текст після списку знову стає абзацом', () => {
    const { container } = body('— Перший\n— Другий\nЩо обираєш?')

    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect(container.querySelector('p')?.textContent?.trim()).toBe(
      'Що обираєш?',
    )
  })

  it('два списки через порожній рядок лишаються двома', () => {
    const { container } = body('— A\n— B\n\n— C')

    expect(container.querySelectorAll('ul')).toHaveLength(2)
  })
})

describe('«Назва — опис» у пункті', () => {
  it('коротка назва виділяється напівжирним', () => {
    const { container } = body('— Генеральне — глибоке прибирання')

    const strong = container.querySelector('li .font-medium')
    expect(strong?.textContent).toBe('Генеральне')
    expect(container.querySelector('li')?.textContent).toContain(
      'глибоке прибирання',
    )
  })

  // Довгий лівий бік — це вже речення з тире посередині, а не термін.
  it('назва довша за чотири слова не жирниться', () => {
    const { container } = body(
      '— Це дуже довга частина речення — і продовження',
    )

    expect(container.querySelector('li .font-medium')).toBeNull()
  })

  it('тире без пробілів терміном не вважається', () => {
    const { container } = body('— Ціна 500—700 грн')

    expect(container.querySelector('li .font-medium')).toBeNull()
  })

  it('пункт без тире лишається звичайним', () => {
    const { container } = body('— Просто пункт')

    expect(container.querySelector('li .font-medium')).toBeNull()
  })

  it('порожня назва не жирниться', () => {
    const { container } = body('—  — опис')

    expect(container.querySelector('li .font-medium')).toBeNull()
  })
})

describe('курсор друку', () => {
  it('без typing курсора немає', () => {
    const { container } = body('Текст')

    expect(container.querySelector('.animate-pulse')).toBeNull()
  })

  it('курсор стоїть у КІНЦІ останнього абзацу', () => {
    const { container } = body('Перший.\n\nОстанній.', true)

    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs[0].querySelector('.animate-pulse')).toBeNull()
    expect(paragraphs[1].querySelector('.animate-pulse')).not.toBeNull()
  })

  it('у списку курсор стоїть в останньому пункті', () => {
    const { container } = body('— A\n— B', true)

    const items = container.querySelectorAll('li')
    expect(items[0].querySelector('.animate-pulse')).toBeNull()
    expect(items[1].querySelector('.animate-pulse')).not.toBeNull()
  })

  // Перший кадр стріму: тексту ще немає, але людина має бачити, що щось
  // відбувається.
  it('на порожньому тексті курсор усе одно видно', () => {
    const { container } = body('', true)

    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })

  it('курсор рівно один', () => {
    const { container } = body('Абзац.\n\n— A\n— B', true)

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(1)
  })
})

describe('текст моделі як недовірений ввід', () => {
  // Вивід моделі керується репліками клієнта. {@html} тут немає за
  // побудовою — текст іде лише текстовими вузлами Svelte.
  it('HTML із відповіді моделі не виконується', () => {
    const { container } = body('<script>alert(1)</script> і далі текст')

    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>alert(1)</script>')
  })

  it('розмітка в пункті списку теж лишається текстом', () => {
    const { container } = body('— <img src=x onerror=alert(1)> — опис')

    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<img')
  })

  it('дуже довгий рядок не роняє рендер', () => {
    const { container } = body('а'.repeat(20_000))

    expect(container.querySelectorAll('p')).toHaveLength(1)
  })
})
