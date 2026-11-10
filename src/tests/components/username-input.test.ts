import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import {
  installFetch,
  fetchMock,
  respondWith,
  respondOffline,
} from './helpers/client-infra'
import UsernameInput from '$lib/components/username-input.svelte'

// Поле @username — єдине місце, де користувач сам обирає публічну адресу
// свого профілю. Перевірок тут три шари, і плутати їх не можна:
//
//   формат      — локально, з $lib/username (той самий модуль, що й на сервері);
//   зарезервоване — теж локально, зі свого списку;
//   зайнятість  — тільки запитом, із затримкою.
//
// Затримка тут не косметична: без неї кожна натиснута літера — це запит до
// бази. Процес один і Neon тарифікує час роботи (див. AGENTS.md, 2.1).

const field = (props: Record<string, unknown> = {}) =>
  render(UsernameInput, { props: { value: '', ...props } as never })

const input = (c: HTMLElement) =>
  c.querySelector<HTMLInputElement>('input#username')!

/** Прокрутити дебаунс і дати відповіді сервера доїхати. */
const settle = () => vi.advanceTimersByTimeAsync(600)

// Фейкові таймери тут не для швидкості: компонент НЕ знімає таймер
// дебаунса при демонтуванні (див. останній тест), тож на справжніх
// таймерах запит із попереднього тесту прилітав би в наступний.
beforeEach(() => {
  vi.useFakeTimers()
  installFetch()
  respondWith({ available: true })
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

/** Клас саме як окремий клас, а не як частина `aria-invalid:border-…`. */
const hasClass = (el: Element, name: string) => el.classList.contains(name)

describe('формат', () => {
  it('порожнє поле помилок не показує', () => {
    const { container } = field()

    expect(container.textContent).not.toContain('3-20 символів')
  })

  // Помилка формату зʼявляється ПІСЛЯ виходу з поля, а не на першій
  // набраній літері: інакше поле червоніє людині, яка ще друкує.
  it('поки друкують, помилки формату немає', async () => {
    const { container } = field()

    await fireEvent.input(input(container), { target: { value: 'ab' } })

    expect(container.textContent).not.toContain('3-20 символів')
    expect(hasClass(input(container), 'border-destructive')).toBe(false)
  })

  it('короткий username підсвічується помилкою після blur', async () => {
    const { container } = field()

    await fireEvent.input(input(container), { target: { value: 'ab' } })
    await fireEvent.blur(input(container))

    expect(container.textContent).toContain('3-20 символів')
    expect(hasClass(input(container), 'border-destructive')).toBe(true)
  })

  // Порожнє поле мовчить, доки його не чіпали. На сабміті форма сама
  // вмикає touched — інакше обовʼязкове поле лишалось би білим, а
  // кнопка мовчки не спрацьовувала б.
  it('порожнє обовʼязкове поле червоніє, коли форма це вмикає', () => {
    const { container } = field({ touched: true })

    expect(container.textContent).toContain('Введіть username')
    expect(hasClass(input(container), 'border-destructive')).toBe(true)
  })

  it('початок з цифри — теж помилка', async () => {
    const { container } = field()

    await fireEvent.input(input(container), { target: { value: '1master' } })
    await fireEvent.blur(input(container))

    expect(container.textContent).toContain('3-20 символів')
  })

  // Заборонені символи ріжуться прямо при введенні, а не після відправки:
  // так людина одразу бачить, що можна.
  it('заборонені символи не потрапляють у поле', async () => {
    const { container } = field()
    const el = input(container)

    await fireEvent.input(el, { target: { value: 'Олек-САНДР!' } })

    expect(el.value).toBe('')
  })

  it('великі літери приводяться до малих', async () => {
    const { container } = field()
    const el = input(container)

    await fireEvent.input(el, { target: { value: 'MasterOne' } })

    expect(el.value).toBe('masterone')
  })

  it('підкреслення й цифри дозволені', async () => {
    const { container } = field()
    const el = input(container)

    await fireEvent.input(el, { target: { value: 'oleks_2026' } })

    expect(el.value).toBe('oleks_2026')
    expect(container.textContent).not.toContain('3-20 символів')
  })

  it('довжина обмежена на рівні поля', () => {
    const { container } = field()

    expect(input(container).getAttribute('maxlength')).toBe('20')
  })

  // Зарезервовані імена — це маршрути застосунку. Повідомлення окреме,
  // бо «3-20 символів» тут збивало б з пантелику: формат-то правильний.
  it('зарезервоване ім’я має власне пояснення', async () => {
    const { container } = field()

    await fireEvent.input(input(container), { target: { value: 'admin' } })
    await fireEvent.blur(input(container))

    expect(container.textContent).toContain('зарезервовано')
    expect(container.textContent).not.toContain('3-20 символів')
  })
})

describe('перевірка зайнятості', () => {
  it('битий формат сервер не турбує зовсім', async () => {
    const { container } = field()

    await fireEvent.input(input(container), { target: { value: 'ab' } })
    await settle()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  // Зелену рамку прибрано навмисно: «вільно» каже галочка в полі, а
  // рамка лишається кольоровою тільки тоді, коли щось не так.
  it('вільне ім’я не показує жодної помилки', async () => {
    respondWith({ available: true })
    const { container } = field()

    await fireEvent.input(input(container), { target: { value: 'freeone' } })
    await settle()

    expect(hasClass(input(container), 'border-destructive')).toBe(false)
    expect(container.textContent).not.toContain('вже зайнято')
  })

  it('зайняте ім’я пояснюється текстом', async () => {
    respondWith({ available: false })
    const { container } = field()

    await fireEvent.input(input(container), { target: { value: 'takenone' } })
    await settle()

    expect(container.textContent).toContain('вже зайнято')
    expect(hasClass(input(container), 'border-destructive')).toBe(true)
  })

  it('ім’я їде в запит закодованим', async () => {
    const { container } = field()

    await fireEvent.input(input(container), { target: { value: 'oleks_2026' } })
    await settle()

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      '/api/user/username/check?username=oleks_2026',
    )
  })

  // Кожна літера — це запит до бази, якщо не тримати паузу.
  it('швидке друкування дає ОДИН запит, а не по одному на літеру', async () => {
    const { container } = field()
    const el = input(container)

    for (const v of ['ma', 'mas', 'mast', 'maste', 'master']) {
      await fireEvent.input(el, { target: { value: v } })
    }
    await settle()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('master')
  })

  // Редагування профілю без зміни username — не привід казати «зайнято».
  it('власний поточний username вважається вільним без запиту', async () => {
    const { container } = field({ currentUsername: 'myname' })

    await fireEvent.input(input(container), { target: { value: 'myname' } })
    await settle()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(hasClass(input(container), 'border-destructive')).toBe(false)
  })

  it('немає мережі — поле не бреше про доступність', async () => {
    respondOffline()
    const { container } = field()

    await fireEvent.input(input(container), { target: { value: 'someone' } })
    await settle()

    expect(hasClass(input(container), 'border-green-500')).toBe(false)
    expect(hasClass(input(container), 'border-destructive')).toBe(false)
  })
})

describe('життєвий цикл', () => {
  // $effect із таймером мусить його ж і знімати. Без прибирання піти з
  // форми, не дочекавшись 400 мс, означало запит для компонента, якого
  // вже немає.
  it('демонтування знімає відкладений запит', async () => {
    const { container, unmount } = field()

    await fireEvent.input(input(container), { target: { value: 'someone' } })
    unmount()
    await settle()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('після демонтування не лишається жодного живого таймера', async () => {
    const { container, unmount } = field()

    await fireEvent.input(input(container), { target: { value: 'someone' } })
    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})

// Підпис і адресу профілю дає поле форми (SettingsField з підказкою).
// Коли компонент малював їх і сам, у формі «Username» стояв двічі.
describe('без дублювання підпису', () => {
  it('власного підпису й опису в компоненті немає', () => {
    const { container } = field()

    expect(container.querySelector('label')).toBeNull()
    expect(container.textContent).not.toContain('zunor.org')
  })

  it('id лишається тим, на який вказує підпис форми', () => {
    const { container } = field()

    expect(input(container).id).toBe('username')
  })
})
