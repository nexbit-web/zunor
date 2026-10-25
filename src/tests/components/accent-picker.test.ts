import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import AccentPicker from '$lib/components/settings/accent-picker.svelte'
import {
  appearance,
  ACCENTS,
  ACCENT_KEY,
  CONTRAST_KEY,
  DEFAULT_ACCENT,
} from '$lib/stores/appearance.svelte'

// Акцентний колір і контраст — персональний вигляд у localStorage, що
// діє через атрибут на <html>. Тут перевіряється те, що легко зламати
// непомітно:
//   • ключі сховища ті самі, що читає скрипт в app.html (інакше вибір
//     «забувається» на кожному перезавантаженні, а помилки ніде немає);
//   • типовий колір НЕ пишеться в сховище й не лишає атрибута — тоді
//     зміна типового в layout.css дійде до всіх, хто його не міняв;
//   • палітра — справжня радіогрупа з клавіатурою, як і вибір теми.

const swatches = (c: HTMLElement) => [
  ...c.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
]

const root = () => document.documentElement

// Стор — модульний синглтон: стан попереднього тесту інакше поїхав би
// в наступний.
beforeEach(() => {
  appearance.setAccent(DEFAULT_ACCENT)
  appearance.setHighContrast(false)
  localStorage.clear()
})

describe('палітра', () => {
  it('десять кольорів у порядку палітри', () => {
    const { container } = render(AccentPicker)

    expect(swatches(container).map((b) => b.getAttribute('aria-label'))).toEqual(
      ACCENTS.map((a) => a.label),
    )
  })

  // Колір зразка задає layout.css за data-accent — той самий атрибут,
  // що перефарбовує застосунок. Без нього зразок малювався б поточним
  // акцентом, і вся палітра була б одного кольору.
  it('кожен зразок несе власний data-accent', () => {
    const { container } = render(AccentPicker)

    expect(swatches(container).map((b) => b.dataset.accent)).toEqual(
      ACCENTS.map((a) => a.id),
    )
  })

  it('id кольорів підходять під перевірку в app.html', () => {
    for (const a of ACCENTS) {
      expect(a.id).toMatch(/^[a-z]{2,16}$/)
    }
  })

  it('за замовчуванням обрано синій', () => {
    const { container } = render(AccentPicker)

    const selected = swatches(container).filter(
      (b) => b.getAttribute('aria-checked') === 'true',
    )
    expect(selected).toHaveLength(1)
    expect(selected[0].dataset.accent).toBe('blue')
  })

  it('галочка стоїть тільки на обраному', () => {
    const { container } = render(AccentPicker)

    const withCheck = swatches(container).filter(
      (b) => b.querySelector('svg') !== null,
    )
    expect(withCheck.map((b) => b.dataset.accent)).toEqual(['blue'])
  })

  it('кнопки не сабмітять форму, в якій лежать', () => {
    const { container } = render(AccentPicker)

    for (const b of swatches(container)) {
      expect(b.getAttribute('type')).toBe('button')
    }
  })
})

describe('вибір кольору', () => {
  it('клік ставить атрибут на <html> і пише вибір у сховище', async () => {
    const { container } = render(AccentPicker)
    const pink = swatches(container).find((b) => b.dataset.accent === 'pink')!

    await fireEvent.click(pink)

    expect(appearance.accent).toBe('pink')
    expect(root().dataset.accent).toBe('pink')
    expect(localStorage.getItem(ACCENT_KEY)).toBe('pink')
    expect(pink.getAttribute('aria-checked')).toBe('true')
  })

  it('повернення до синього прибирає і атрибут, і запис', async () => {
    const { container } = render(AccentPicker)
    const find = (id: string) =>
      swatches(container).find((b) => b.dataset.accent === id)!

    await fireEvent.click(find('green'))
    await fireEvent.click(find('blue'))

    expect(root().dataset.accent).toBeUndefined()
    expect(localStorage.getItem(ACCENT_KEY)).toBeNull()
  })
})

describe('клавіатура', () => {
  it('у групу один вхід табом — на обраному кольорі', () => {
    const { container } = render(AccentPicker)

    const tabbable = swatches(container).filter(
      (b) => b.getAttribute('tabindex') === '0',
    )
    expect(tabbable.map((b) => b.dataset.accent)).toEqual(['blue'])
  })

  it('стрілка вправо обирає наступний колір', async () => {
    const { container } = render(AccentPicker)
    const i = ACCENTS.findIndex((a) => a.id === 'blue')

    await fireEvent.keyDown(swatches(container)[i], { key: 'ArrowRight' })

    expect(appearance.accent).toBe(ACCENTS[i + 1].id)
  })

  it('з першого вліво — на останній', async () => {
    const { container } = render(AccentPicker)

    await fireEvent.keyDown(swatches(container)[0], { key: 'ArrowLeft' })

    expect(appearance.accent).toBe(ACCENTS[ACCENTS.length - 1].id)
  })

  it('інші клавіші компонент не перехоплює', async () => {
    const { container } = render(AccentPicker)

    await fireEvent.keyDown(swatches(container)[0], { key: 'Tab' })

    expect(appearance.accent).toBe(DEFAULT_ACCENT)
  })
})

describe('висока контрастність', () => {
  it('вмикається атрибутом на <html> і записом у сховище', () => {
    appearance.setHighContrast(true)

    expect(root().dataset.contrast).toBe('more')
    expect(localStorage.getItem(CONTRAST_KEY)).toBe('more')
  })

  it('вимкнення прибирає і атрибут, і запис', () => {
    appearance.setHighContrast(true)
    appearance.setHighContrast(false)

    expect(root().dataset.contrast).toBeUndefined()
    expect(localStorage.getItem(CONTRAST_KEY)).toBeNull()
  })
})
