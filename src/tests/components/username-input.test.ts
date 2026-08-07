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

  it('короткий username підсвічується помилкою', async () => {
    const { container } = field()

    await fireEvent.input(input(container), { target: { value: 'ab' } })

    expect(container.textContent).toContain('3-20 символів')
    expect(hasClass(input(container), 'border-destructive')).toBe(true)
  })

  it('початок з цифри — теж помилка', async () => {
    const { container } = field()

    await fireEvent.input(input(container), { target: { value: '1master' } })

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

  it('вільне ім’я підсвічується зеленим', async () => {
    respondWith({ available: true })
    const { container } = field()

    await fireEvent.input(input(container), { target: { value: 'freeone' } })
    await settle()

    expect(hasClass(input(container), 'border-green-500')).toBe(true)
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
    expect(hasClass(input(container), 'border-green-500')).toBe(true)
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
  // ⚠️ $effect дебаунса НЕ повертає прибирання: timer знімається лише при
  // наступному введенні. Пішов з форми, не дочекавшись 400 мс, — запит усе
  // одно полетить, уже для демонтованого компонента.
  //
  // Наслідок дрібний (один зайвий GET), але це саме той клас недогляду, про
  // який AGENTS.md каже окремо: $effect із таймером мусить його ж і знімати.
  // Лікується одним рядком — `return () => { if (timer) clearTimeout(timer) }`.
  it('таймер переживає демонтування компонента', async () => {
    const { container, unmount } = field()

    await fireEvent.input(input(container), { target: { value: 'someone' } })
    unmount()
    await settle()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('превʼю посилання', () => {
  it('порожнє поле показує підказку-заглушку', () => {
    const { container } = field()

    expect(container.textContent).toContain('zunor.org/@username')
  })

  it('введене ім’я одразу видно в посиланні', async () => {
    const { container } = field()

    await fireEvent.input(input(container), { target: { value: 'oleks' } })

    expect(container.textContent).toContain('zunor.org/@oleks')
  })

  it('при помилці формату показується помилка, а не посилання', async () => {
    const { container } = field()

    await fireEvent.input(input(container), { target: { value: 'ab' } })

    expect(container.textContent).not.toContain('zunor.org/@ab')
  })
})
