import { describe, it, expect, afterEach } from 'vitest'
import { render } from '@testing-library/svelte'
import FreelancerProfile from '$lib/components/profile/freelancer-profile-view.svelte'
import ClientProfile from '$lib/components/profile/client-profile-view.svelte'
import type {
  FreelancerProfileData,
  ClientProfileData,
} from '$lib/components/profile/types'

// Дві публічні сторінки профілю. Тут перевіряються дві обіцянки з
// маніфесту, і обидві коштують дорого, якщо їх порушити:
//
//   1. КОНТАКТИ ЗАКРИТІ ДО УГОДИ. Телефон є в типі профілю (`phone?:`), і
//      варто комусь «показати його поруч із іменем» — обійти платформу
//      стане можна одним поглядом на сторінку. Сервер його не віддає, але
//      це друга лінія: компонент не показує телефон навіть якщо той приїхав.
//   2. КЛІЄНТ — НЕ ВІТРИНА. Сторінка клієнта закрита від індексації;
//      профіль майстра, навпаки, і є вітриною.

const PHONE = '+380991234567'

function master(
  over: Partial<FreelancerProfileData> = {},
): FreelancerProfileData {
  return {
    id: 'master-1',
    name: 'Оля Клінер',
    username: 'olya',
    avatar: null,
    bio: 'Прибираю квартири й офіси',
    phone: null,
    city: 'Одеса',
    createdAt: '2025-06-01T00:00:00.000Z',
    verificationStatus: 'VERIFIED',
    verificationRejectReason: null,
    categories: ['Прибирання'],
    categorySlugs: ['cleaning'],
    portfolioImages: [],
    avgRating: 4.8,
    reviewsCount: 12,
    completedOrders: 34,
    reviews: [],
    ...over,
  }
}

function client(over: Partial<ClientProfileData> = {}): ClientProfileData {
  return {
    id: 'client-1',
    name: 'Ігор',
    username: undefined,
    avatar: null,
    bio: null,
    phone: null,
    city: 'Одеса',
    createdAt: '2025-06-01T00:00:00.000Z',
    totalOrders: 5,
    completedOrders: 4,
    avgRating: 5,
    reviewsCount: 2,
    reviews: [],
    ...over,
  }
}

const masterView = (
  over: Partial<FreelancerProfileData> = {},
  isOwner = false,
) =>
  render(FreelancerProfile, {
    props: { user: master(over), isOwner, isAuthenticated: true } as never,
  })

const clientView = (over: Partial<ClientProfileData> = {}, isOwner = false) =>
  render(ClientProfile, {
    props: { user: client(over), isOwner, isAuthenticated: true } as never,
  })

afterEach(() => {
  document.head.querySelectorAll('meta[name="robots"]').forEach((m) => {
    m.remove()
  })
})

describe('телефон не показується нікому', () => {
  it('на профілі майстра — навіть якщо приїхав у даних', () => {
    const { container } = masterView({ phone: PHONE })

    expect(container.textContent).not.toContain(PHONE)
    expect(container.textContent).not.toContain('380991234567')
  })

  it('на профілі клієнта — так само', () => {
    const { container } = clientView({ phone: PHONE })

    expect(container.textContent).not.toContain(PHONE)
  })

  // Власнику теж: сторінка публічна, і показувати на ній телефон — значить
  // показувати його всім, хто відкриє посилання.
  it('власнику свого профілю теж не показується', () => {
    const master = masterView({ phone: PHONE }, true)
    const cl = clientView({ phone: PHONE }, true)

    expect(master.container.textContent).not.toContain(PHONE)
    expect(cl.container.textContent).not.toContain(PHONE)
  })

  it('телефон не тече і в атрибути — жодного tel:', () => {
    const { container } = masterView({ phone: PHONE })

    expect(container.innerHTML).not.toContain('tel:')
    expect(container.innerHTML).not.toContain(PHONE)
  })
})

describe('профіль майстра — вітрина', () => {
  it('показує ім’я, місто й опис', () => {
    const { container } = masterView()

    expect(container.textContent).toContain('Оля Клінер')
    expect(container.textContent).toContain('Одеса')
    expect(container.textContent).toContain('Прибираю квартири й офіси')
  })

  it('показує рейтинг і кількість виконаних', () => {
    const { container } = masterView({ avgRating: 4.8, completedOrders: 34 })

    expect(container.textContent).toContain('4.8')
    expect(container.textContent).toContain('34')
  })

  it('верифікований отримує галочку', () => {
    const verified = masterView({ verificationStatus: 'VERIFIED' })
    const plain = masterView({ verificationStatus: 'NONE' })

    expect(verified.container.innerHTML).not.toBe(plain.container.innerHTML)
  })

  it('без опису показує пояснення, різне для власника й гостя', () => {
    const guest = masterView({ bio: null }, false)
    const owner = masterView({ bio: null }, true)

    expect(guest.container.textContent).toContain('Майстер ще не додав опис')
    expect(owner.container.textContent).toContain('Ти ще не додав опис')
  })

  // ⚠️ Видима лише ПЕРША категорія (`primaryCategory = categories[0]`), хоч
  // у профілі їх масив. Сьогодні це не помітно — категорія одна на весь
  // продукт. Але додавання другої категорії має бути додаванням КОНТЕНТУ
  // (розділ «движок vs контент»), а тут воно вимагатиме правки розмітки:
  // майстер із двома напрямками мовчки показуватиме один.
  //
  // У schema.org-розмітку (knowsAbout) при цьому їдуть УСІ — тобто пошуковик
  // бачить більше, ніж людина на сторінці.
  it('у видимій частині показується лише перша категорія', () => {
    const { container } = masterView({ categories: ['Прибирання', 'Вікна'] })

    expect(container.textContent).toContain('Прибирання')
    expect(container.textContent).not.toContain('Вікна')
  })

  it('майстер без категорій рендериться без порожнього блоку', () => {
    const { container } = masterView({ categories: [] })

    expect(container.textContent).toContain('Оля Клінер')
  })

  // Ім'я приходить від користувача — розмітка в ньому лишається текстом.
  it('розмітка в імені не виконується', () => {
    const { container } = masterView({ name: '<img src=x onerror=alert(1)>' })

    expect(container.querySelector('img[src="x"]')).toBeNull()
    expect(container.textContent).toContain('<img')
  })
})

describe('профіль клієнта — не вітрина', () => {
  // Клієнт не продає послуги, тож його сторінка не має жити в пошуку.
  it('сторінка закрита від індексації', () => {
    clientView()

    const robots = document.head.querySelector('meta[name="robots"]')
    expect(robots?.getAttribute('content')).toContain('noindex')
  })

  it('показує ім’я й місто', () => {
    const { container } = clientView()

    expect(container.textContent).toContain('Ігор')
    expect(container.textContent).toContain('Одеса')
  })

  it('показує кількість замовлень', () => {
    const { container } = clientView({ totalOrders: 5, completedOrders: 4 })

    expect(container.textContent).toContain('5')
  })

  it('без відгуків показує порожній стан, а не порожнечу', () => {
    const { container } = clientView({ reviews: [], reviewsCount: 0 })

    expect(container.textContent?.trim().length).toBeGreaterThan(0)
  })

  it('відгук показується з автором і текстом', () => {
    const { container } = clientView({
      reviews: [
        {
          id: 'r-1',
          authorName: 'Оля',
          authorInitials: 'О',
          rating: 5,
          text: 'Все чітко, дякую',
          createdAt: '2026-02-01T00:00:00.000Z',
        },
      ],
      reviewsCount: 1,
    })

    expect(container.textContent).toContain('Оля')
    expect(container.textContent).toContain('Все чітко, дякую')
  })

  it('текст відгуку не виконується як розмітка', () => {
    const { container } = clientView({
      reviews: [
        {
          id: 'r-1',
          authorName: 'Оля',
          authorInitials: 'О',
          rating: 5,
          text: '<script>alert(1)</script>',
          createdAt: '2026-02-01T00:00:00.000Z',
        },
      ],
      reviewsCount: 1,
    })

    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>')
  })
})

describe('стійкість до неповних даних', () => {
  it('майстер без міста, аватара й категорій рендериться', () => {
    expect(() =>
      masterView({ city: null, avatar: null, categories: [] }),
    ).not.toThrow()
  })

  it('битий createdAt не роняє сторінку', () => {
    expect(() => masterView({ createdAt: 'не дата' })).not.toThrow()
    expect(() => clientView({ createdAt: 'не дата' })).not.toThrow()
  })

  it('нульовий рейтинг не показується як «зірки є»', () => {
    const { container } = masterView({ avgRating: 0, reviewsCount: 0 })

    expect(container.textContent).not.toContain('0.0 з 5')
  })
})
