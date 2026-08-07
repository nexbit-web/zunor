import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import { createRawSnippet } from 'svelte'
import SettingsGroup from '$lib/components/settings/settings-group.svelte'
import SettingsRow from '$lib/components/settings/settings-row.svelte'
import SettingsField from '$lib/components/settings/settings-field.svelte'
import SettingsBlock from '$lib/components/settings/settings-block.svelte'

// Чотири компоненти, з яких зібрані ВСІ згруповані картки застосунку:
// налаштування, онбординг, профіль. Візуальна мова тут одна на весь
// продукт, і зламати її легко — досить скопіювати розмітку картки в
// сторінку «тільки цей раз».
//
// Тести тримають рівно те, що вже одного разу розійшлось по копіях:
//   • роздільник ставить САМ рядок через first:border-t-0 — сторінка не
//     розставляє модифікатори руками;
//   • ширину колонки з контролом знає лише SettingsField (був скопійований
//     дев'ять разів і встиг розійтись у записі);
//   • підпис перетворюється на <label> лише коли є, на що вказувати —
//     інакше скрінрідер веде в нікуди.

/** Снипет із простим текстом — для перевірки, що вміст доїхав. */
const text = (s: string) =>
  createRawSnippet(() => ({ render: () => `<span>${s}</span>` }))

describe('SettingsGroup — картка', () => {
  it('показує заголовок і вміст', () => {
    const { container } = render(SettingsGroup, {
      props: { title: 'Безпека', children: text('вміст') },
    })

    expect(container.querySelector('h2')?.textContent?.trim()).toBe('Безпека')
    expect(container.textContent).toContain('вміст')
  })

  it('без заголовка h2 не рендериться зовсім', () => {
    const { container } = render(SettingsGroup, {
      props: { children: text('вміст') },
    })

    expect(container.querySelector('h2')).toBeNull()
  })

  it('виноска показується під карткою', () => {
    const { container } = render(SettingsGroup, {
      props: { footnote: 'Змінити пізніше не вийде', children: text('x') },
    })

    expect(container.textContent).toContain('Змінити пізніше не вийде')
  })

  it('без виноски порожнього абзацу не лишається', () => {
    const { container } = render(SettingsGroup, {
      props: { children: text('x') },
    })

    expect(container.querySelectorAll('p')).toHaveLength(0)
  })

  // Візуальна мова картки: заокруглення + приглушений фон + py-1, який
  // разом із mx-4 у рядках дає втоплені лінії.
  it('картка має спільні класи, а не свої власні', () => {
    const { container } = render(SettingsGroup, {
      props: { children: text('x') },
    })

    const card = container.querySelector('section > div')
    expect(card?.className).toContain('rounded-xl')
    expect(card?.className).toContain('bg-muted/40')
    expect(card?.className).toContain('py-1')
  })

  // Рамки з divide-y тут більше немає навмисно: два розділи налаштувань
  // з нею виглядали як шматок іншого застосунку.
  it('рамки з divide-y немає', () => {
    const { container } = render(SettingsGroup, {
      props: { children: text('x') },
    })

    expect(container.innerHTML).not.toContain('divide-y')
  })
})

describe('SettingsRow — рядок з контролом', () => {
  it('показує підпис і опис', () => {
    const { container } = render(SettingsRow, {
      props: { label: 'Двофакторна', description: 'Код на пошту' },
    })

    expect(container.textContent).toContain('Двофакторна')
    expect(container.textContent).toContain('Код на пошту')
  })

  it('з for підпис стає <label> і веде в контрол', () => {
    const { container } = render(SettingsRow, {
      props: { label: 'Тема', for: 'theme-input' },
    })

    expect(container.querySelector('label')?.getAttribute('for')).toBe(
      'theme-input',
    )
  })

  // <label>, який нікуди не веде, лише збиває скрінрідер — тому без for
  // це звичайний текст.
  it('без for підпис лишається текстом, а не порожнім label', () => {
    const { container } = render(SettingsRow, { props: { label: 'Статус' } })

    expect(container.querySelector('label')).toBeNull()
    expect(container.querySelector('p')?.textContent?.trim()).toBe('Статус')
  })

  it('без контрола порожня колонка праворуч не рендериться', () => {
    const { container } = render(SettingsRow, { props: { label: 'Статус' } })

    expect(container.querySelector('.shrink-0')).toBeNull()
  })

  it('контрол показується праворуч', () => {
    const { container } = render(SettingsRow, {
      props: { label: 'Статус', control: text('Увімкнено') },
    })

    expect(container.querySelector('.shrink-0')?.textContent).toContain(
      'Увімкнено',
    )
  })

  // Про роздільник знає сам рядок — сторінка не мусить пам'ятати, який він
  // за рахунком. Без first:border-t-0 верхня лінія різала б заокруглення.
  it('роздільник ставить сам рядок, включно з винятком для першого', () => {
    const { container } = render(SettingsRow, { props: { label: 'x' } })

    const row = container.firstElementChild as HTMLElement
    expect(row.className).toContain('border-t')
    expect(row.className).toContain('first:border-t-0')
    expect(row.className).toContain('mx-4')
  })
})

describe('SettingsField — поле форми', () => {
  it('показує підпис, підказку і контрол', () => {
    const { container } = render(SettingsField, {
      props: {
        label: 'Ім’я',
        hint: 'Так тебе побачать майстри',
        control: text('input'),
      },
    })

    expect(container.textContent).toContain('Ім’я')
    expect(container.textContent).toContain('Так тебе побачать майстри')
    expect(container.textContent).toContain('input')
  })

  // Помилка форми живе ПІД полем, а не в тості: там на неї дивляться,
  // і вона не зникає за чотири секунди.
  it('помилка показується під контролом з role="alert"', () => {
    const { container } = render(SettingsField, {
      props: { label: 'Ім’я', error: 'Занадто коротке', control: text('i') },
    })

    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent?.trim()).toBe('Занадто коротке')
  })

  it('без помилки блоку помилки немає', () => {
    const { container } = render(SettingsField, {
      props: { label: 'Ім’я', control: text('i') },
    })

    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  // Той самий рядок класів був скопійований у дев'ять місць і вже почав
  // розходитись у записі (max-w-[300px] проти max-w-75).
  it('ширину колонки з контролом знає лише цей компонент', () => {
    const { container } = render(SettingsField, {
      props: { label: 'x', control: text('i') },
    })

    const row = container.firstElementChild as HTMLElement
    const controlCol = row.children[1] as HTMLElement
    expect(controlCol.className).toContain('sm:w-[56%]')
    expect(controlCol.className).toContain('sm:max-w-75')
  })

  it('роздільник такий самий, як у решти рядків', () => {
    const { container } = render(SettingsField, {
      props: { label: 'x', control: text('i') },
    })

    const row = container.firstElementChild as HTMLElement
    expect(row.className).toContain('first:border-t-0')
    expect(row.className).toContain('mx-4')
  })

  it('з for клік по підпису фокусує контрол', () => {
    const { container } = render(SettingsField, {
      props: { label: 'Ім’я', for: 'name', control: text('i') },
    })

    expect(container.querySelector('label')?.getAttribute('for')).toBe('name')
  })
})

describe('SettingsBlock — блок на всю ширину', () => {
  it('показує вміст', () => {
    const { container } = render(SettingsBlock, {
      props: { children: text('вибір теми') },
    })

    expect(container.textContent).toContain('вибір теми')
  })

  it('roomy додає більші відступи, а не інші класи', () => {
    const tight = render(SettingsBlock, { props: { children: text('a') } })
    expect(
      (tight.container.firstElementChild as HTMLElement).className,
    ).toContain('py-3')

    const roomy = render(SettingsBlock, {
      props: { roomy: true, children: text('b') },
    })
    expect(
      (roomy.container.firstElementChild as HTMLElement).className,
    ).toContain('py-5')
  })

  it('роздільник — той самий, що в рядків', () => {
    const { container } = render(SettingsBlock, {
      props: { children: text('a') },
    })

    const block = container.firstElementChild as HTMLElement
    expect(block.className).toContain('border-t')
    expect(block.className).toContain('first:border-t-0')
    expect(block.className).toContain('mx-4')
  })
})
