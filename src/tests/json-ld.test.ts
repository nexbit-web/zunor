import { describe, it, expect } from 'vitest'
import { safeJsonLd } from '$lib/utils/json-ld'

describe('safeJsonLd', () => {
  // Головний сценарій: майстер ставить собі таке ім'я, і воно потрапляє
  // в <script type="application/ld+json"> на його публічній сторінці.
  it('не дає закрити тег script значенням з профілю', () => {
    const out = safeJsonLd({
      name: '</script><script>alert(1)</script>',
    })
    expect(out).not.toContain('</script')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('<')
  })

  it('екранує кутові дужки та амперсанд', () => {
    const out = safeJsonLd({ bio: '<b>&</b>' })
    expect(out).toContain('\\u003c')
    expect(out).toContain('\\u003e')
    expect(out).toContain('\\u0026')
  })

  it('екранує роздільники рядків U+2028/U+2029', () => {
    const out = safeJsonLd({
      bio: `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c`,
    })
    expect(out).toContain('\\u2028')
    expect(out).toContain('\\u2029')
    expect(out).not.toContain(String.fromCharCode(0x2028))
    expect(out).not.toContain(String.fromCharCode(0x2029))
  })

  // Екранування не має ламати сам JSON — інакше Google не прочитає розмітку.
  it('лишається валідним JSON із тим самим змістом', () => {
    const data = { name: 'Мийка <вікон> & килимів', rating: 4.8 }
    expect(JSON.parse(safeJsonLd(data))).toEqual(data)
  })

  it('не чіпає звичайний текст', () => {
    expect(safeJsonLd({ city: 'Одеса' })).toBe('{"city":"Одеса"}')
  })
})
