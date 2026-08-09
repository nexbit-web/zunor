import { describe, it, expect, afterEach } from 'vitest'
import { render } from '@testing-library/svelte'
import JsonLd from '$lib/components/seo/JsonLd.svelte'

// Єдиний {@html} у проєкті. Він живий навмисно — JSON-LD інакше в <head>
// не покласти, — і тому це найчутливіше місце в усій розмітці: рядок
// «</script>» усередині даних закриває тег і все після нього стає кодом
// сторінки.
//
// Захист один: safeJsonLd екранує «<». Тести перевіряють не саму утиліту
// (для неї є json-ld.test.ts у серверному наборі), а те, що компонент
// справді ходить через неї і на кожному пропсі.

/** Вміст усіх ld+json зі <head>. */
function scripts(): string[] {
  return [
    ...document.head.querySelectorAll('script[type="application/ld+json"]'),
  ].map((s) => s.textContent ?? '')
}

const seo = (over: Partial<Record<string, string>> = {}) =>
  render(JsonLd, {
    props: {
      title: 'Zunor — прибирання в Одесі',
      description: 'Замовити прибирання',
      canonical: 'https://zunor.org',
      ...over,
    } as never,
  })

afterEach(() => {
  // svelte:head лишає теги в <head> — cleanup() прибирає лише body.
  for (const s of document.head.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    s.remove()
  }
})

describe('розмітка для пошуковика', () => {
  it('кладе рівно один ld+json у head', () => {
    seo()

    expect(scripts()).toHaveLength(1)
  })

  it('усередині валідний JSON', () => {
    seo()

    expect(() => JSON.parse(scripts()[0])).not.toThrow()
  })

  it('описує локальний бізнес за schema.org', () => {
    seo()
    const data = JSON.parse(scripts()[0])

    expect(data['@context']).toBe('https://schema.org')
    expect(data['@type']).toBe('LocalBusiness')
    expect(data.name).toContain('Zunor')
  })

  it('опис і канонічний URL беруться з пропсів', () => {
    seo({
      description: 'Прибирання квартир і офісів',
      canonical: 'https://zunor.org/master/about',
    })
    const data = JSON.parse(scripts()[0])

    expect(data.description).toBe('Прибирання квартир і офісів')
    expect(data.url).toBe('https://zunor.org/master/about')
  })

  // Старт з Одеси — це продуктове рішення, а не випадкові координати.
  it('місто й координати вказані', () => {
    seo()
    const data = JSON.parse(scripts()[0])

    expect(data.address.addressLocality).toBe('Одеса')
    expect(data.address.addressCountry).toBe('UA')
    expect(data.geo.latitude).toBeTruthy()
  })

  it('графік роботи заповнений', () => {
    seo()
    const data = JSON.parse(scripts()[0])

    expect(data.openingHoursSpecification[0].dayOfWeek).toHaveLength(7)
    expect(data.openingHoursSpecification[0].opens).toMatch(/^\d{2}:\d{2}$/)
  })
})

describe('екранування — головне тут', () => {
  // Закривний тег усередині даних закрив би <script> і все, що далі,
  // стало б кодом сторінки.
  it('закривний тег скрипта в описі не закриває скрипт', () => {
    seo({ description: '</script><script>alert(1)</script>' })

    expect(scripts()).toHaveLength(1)
    expect(document.head.querySelectorAll('script').length).toBe(1)
  })

  it('«<» екранований у виводі', () => {
    seo({ description: '<b>жирний</b>' })

    expect(scripts()[0]).not.toContain('<b>')
    expect(scripts()[0]).toContain('\\u003c')
  })

  // Значення проходять різними шляхами всередині схеми (description, url,
  // logo, image) — екранування має спрацювати на кожному.
  it('canonical теж екранується, хоч і підставляється в кілька полів', () => {
    seo({ canonical: 'https://evil.test/</script>' })

    expect(scripts()).toHaveLength(1)
    expect(scripts()[0]).not.toContain('</script>')
  })

  it('після екранування JSON лишається розбірним', () => {
    seo({ description: '</script> та <b>розмітка</b>' })

    const data = JSON.parse(scripts()[0])
    expect(data.description).toBe('</script> та <b>розмітка</b>')
  })

  it('порожні пропси не ламають розмітку', () => {
    seo({ description: '', canonical: '' })

    expect(() => JSON.parse(scripts()[0])).not.toThrow()
  })
})
