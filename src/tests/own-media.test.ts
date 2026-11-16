import { describe, it, expect } from 'vitest'
import {
  acceptedAvatar,
  acceptedPhotos,
  avatarFolder,
  chatFolder,
  isOwnPublicId,
  isOwnUpload,
  isPublicIdIn,
  jobsFolder,
  removedOwnIds,
  userFolder,
} from '$lib/server/own-media'
import { env } from './mocks/env-dynamic-private'

// Єдине правило «цей файл у Cloudinary — саме цієї людини». На ньому
// тримаються дві речі:
//
//   • що потрапляє в базу як посилання на фото (аватар, портфоліо, фото
//     заявки, вкладення чату) — і що потім бачать ІНШІ люди;
//   • що йде в `cloudinary.uploader.destroy`. Тут була найсерйозніша діра:
//     publicId брався з тіла запиту, і чужий id, записаний собі в профіль,
//     наступним збереженням стирав чужий файл із хмари.

const USER = 'user-1'
const CLOUD = env.CLOUDINARY_CLOUD_NAME
const BASE = `https://res.cloudinary.com/${CLOUD}`

describe('isPublicIdIn — publicId у теці', () => {
  it('своя тека проходить', () => {
    expect(isPublicIdIn(`zunor/users/${USER}/avatar/profile`, userFolder(USER))).toBe(true)
    expect(isPublicIdIn(`zunor/users/${USER}/jobs/abc123`, jobsFolder(USER))).toBe(true)
    expect(isPublicIdIn(`zunor/chat/${USER}/doc.pdf`, chatFolder(USER))).toBe(true)
  })

  it('чужа тека не проходить', () => {
    expect(isPublicIdIn('zunor/users/other/avatar/profile', userFolder(USER))).toBe(false)
    expect(isPublicIdIn('zunor/system/logo', userFolder(USER))).toBe(false)
    expect(isPublicIdIn(`zunor/chat/${USER}/x`, userFolder(USER))).toBe(false)
  })

  // Префікс — зі слешем: інакше user-1 забрав би простір user-10.
  it('сусідній id із тим самим початком не проходить', () => {
    expect(isPublicIdIn(`zunor/users/${USER}0/avatar/profile`, userFolder(USER))).toBe(false)
  })

  // startsWith такий шлях пропускає, а веде він уже не у свою теку.
  it('«..» у шляху не проходить', () => {
    for (const id of [
      `zunor/users/${USER}/../other/avatar/profile`,
      `zunor/users/${USER}/avatar/../../other/x`,
      `zunor/users/${USER}/..`,
    ]) {
      expect(isPublicIdIn(id, userFolder(USER))).toBe(false)
    }
  })

  it('сама тека без файлу, не рядок, сміття й задовгий id — ні', () => {
    for (const id of [
      userFolder(USER),
      '',
      null,
      undefined,
      42,
      {},
      `zunor/users/${USER}/a b`,
      `zunor/users/${USER}/a?x=1`,
      `zunor/users/${USER}/a#frag`,
      `zunor/users/${USER}//a`,
      `zunor/users/${USER}/a\\b`,
      `zunor/users/${USER}/a\n`,
      `zunor/users/${USER}/${'a'.repeat(400)}`,
    ]) {
      expect(isPublicIdIn(id, userFolder(USER))).toBe(false)
    }
  })

  it('isOwnPublicId — це тека користувача, а не чату', () => {
    expect(isOwnPublicId(`zunor/users/${USER}/jobs/a`, USER)).toBe(true)
    expect(isOwnPublicId(`zunor/chat/${USER}/a`, USER)).toBe(false)
    expect(isOwnPublicId('old-avatar-id', USER)).toBe(false)
  })
})

describe('isOwnUpload — посилання й publicId разом', () => {
  const id = `zunor/users/${USER}/jobs/photo-1`
  const folder = jobsFolder(USER)

  it('адреса завантаження з нашої хмари проходить', () => {
    for (const url of [
      `${BASE}/image/upload/v1700000000/${id}.jpg`,
      `${BASE}/image/upload/${id}.webp`,
      `${BASE}/image/upload/v1/${id}`,
    ]) {
      expect(isOwnUpload(url, id, folder, { image: true })).toBe(true)
    }
  })

  it('файл (raw) проходить лише там, де дозволено не-картинку', () => {
    const fileId = `zunor/chat/${USER}/doc-1.pdf`
    const url = `${BASE}/raw/upload/v1/${fileId}`
    expect(isOwnUpload(url, fileId, chatFolder(USER))).toBe(true)
    expect(isOwnUpload(url, fileId, chatFolder(USER), { image: true })).toBe(false)
  })

  const bad: [string, string][] = [
    ['чужий домен', `https://evil.com/${CLOUD}/image/upload/v1/${id}.jpg`],
    ['http замість https', `http://res.cloudinary.com/${CLOUD}/image/upload/v1/${id}.jpg`],
    ['домен-двійник', `https://res.cloudinary.com.evil.com/${CLOUD}/image/upload/v1/${id}.jpg`],
    ['піддомен-двійник', `https://evil-res.cloudinary.com/${CLOUD}/image/upload/v1/${id}.jpg`],
    ['логін в адресі', `https://user:pass@res.cloudinary.com/${CLOUD}/image/upload/v1/${id}.jpg`],
    ['інший порт', `https://res.cloudinary.com:8443/${CLOUD}/image/upload/v1/${id}.jpg`],
    // res.cloudinary.com обслуговує ВСІ акаунти: хмара мусить бути нашою.
    ['чужий акаунт Cloudinary', `https://res.cloudinary.com/attacker-cloud/image/upload/v1/${id}.jpg`],
    // fetch віддає чужу адресу крізь нашу хмару — вміст знову не наш.
    ['тип fetch', `${BASE}/image/fetch/https://evil.com/${id}.jpg`],
    ['тип private', `${BASE}/image/private/v1/${id}.jpg`],
    // Накладання тягне чужу картинку поверх нашої.
    ['трансформація', `${BASE}/image/upload/l_fetch:aHR0cHM6Ly9ldmlsLmNvbQ/v1/${id}.jpg`],
    ['інший файл', `${BASE}/image/upload/v1/zunor/users/${USER}/jobs/other.jpg`],
    ['publicId лише як частина шляху', `${BASE}/image/upload/v1/x/${id}.jpg`],
    ['хвіст після файлу', `${BASE}/image/upload/v1/${id}.jpg/extra`],
    ['рядок запиту', `${BASE}/image/upload/v1/${id}.jpg?x=1`],
    ['фрагмент', `${BASE}/image/upload/v1/${id}.jpg#x`],
    ['дивне розширення', `${BASE}/image/upload/v1/${id}.j%70g`],
    ['невідомий тип ресурсу', `${BASE}/files/upload/v1/${id}.jpg`],
    ['не URL', 'просто рядок'],
    ['javascript:', 'javascript:alert(1)'],
  ]

  for (const [label, url] of bad) {
    it(`${label} — не наше`, () => {
      expect(isOwnUpload(url, id, folder, { image: true })).toBe(false)
      expect(isOwnUpload(url, id, folder)).toBe(false)
    })
  }

  it('свій URL із чужим publicId — не наше', () => {
    const foreign = 'zunor/users/other/jobs/photo-1'
    expect(
      isOwnUpload(`${BASE}/image/upload/v1/${foreign}.jpg`, foreign, folder, { image: true }),
    ).toBe(false)
  })

  it('не рядки не валять перевірку', () => {
    expect(isOwnUpload(null, id, folder)).toBe(false)
    expect(isOwnUpload(42, id, folder)).toBe(false)
    expect(isOwnUpload(`${BASE}/image/upload/v1/${id}.jpg`, null, folder)).toBe(false)
  })
})

describe('acceptedAvatar', () => {
  const ownId = `zunor/users/${USER}/avatar/profile`
  const ownUrl = `${BASE}/image/upload/v1/${ownId}.jpg`
  const none = { avatar: null, avatarPublicId: null }

  it('порожнє — фото прибрали', () => {
    for (const raw of ['', null, undefined, 42]) {
      expect(acceptedAvatar(raw, ownId, USER, { avatar: ownUrl, avatarPublicId: ownId })).toEqual(
        none,
      )
    }
  })

  it('своє завантаження в теку аватара приймається', () => {
    expect(acceptedAvatar(ownUrl, ownId, USER, none)).toEqual({
      avatar: ownUrl,
      avatarPublicId: ownId,
    })
  })

  // Фото заявки — теж своє, але аватаром воно не стає: тека інша.
  it('своє фото з іншої теки аватаром не стає', () => {
    const jobId = `zunor/users/${USER}/jobs/a`
    expect(acceptedAvatar(`${BASE}/image/upload/v1/${jobId}.jpg`, jobId, USER, none)).toEqual(none)
  })

  it('фото з Google — без publicId, навіть якщо його прислали', () => {
    const google = 'https://lh3.googleusercontent.com/a/abc'
    expect(acceptedAvatar(google, 'zunor/users/other/avatar/profile', USER, none)).toEqual({
      avatar: google,
      avatarPublicId: null,
    })
  })

  it('двійник домену Google не проходить', () => {
    expect(
      acceptedAvatar('https://lh3.googleusercontent.com.evil.com/a', null, USER, none),
    ).toEqual(none)
  })

  it('те, що вже в профілі, лишається як є', () => {
    const stored = { avatar: 'https://res.cloudinary.com/c/legacy.jpg', avatarPublicId: 'legacy' }
    expect(acceptedAvatar(stored.avatar, stored.avatarPublicId, USER, stored)).toEqual(stored)
  })

  // Той самий URL, але publicId підмінили на чужий — це вже не «те саме».
  it('те саме посилання з іншим publicId — не приймається, профіль не міняється', () => {
    const stored = { avatar: ownUrl, avatarPublicId: ownId }
    expect(acceptedAvatar(ownUrl, 'zunor/users/other/avatar/profile', USER, stored)).toEqual(stored)
  })

  it('недопустиме лишає профіль як був, а не стирає фото', () => {
    const stored = { avatar: ownUrl, avatarPublicId: ownId }
    expect(acceptedAvatar('https://evil.com/x.gif', 'x', USER, stored)).toEqual(stored)
    expect(acceptedAvatar('https://evil.com/x.gif', 'x', USER, {})).toEqual(none)
  })

  it('тека аватара — саме цієї людини', () => {
    expect(avatarFolder(USER)).toBe(`zunor/users/${USER}/avatar/`)
  })
})

describe('acceptedPhotos', () => {
  const folder = userFolder(USER)
  const id = (n: string) => `zunor/users/${USER}/jobs/${n}`
  const url = (publicId: string) => `${BASE}/image/upload/v1/${publicId}.jpg`
  const empty = { urls: [], publicIds: [] }

  it('свої пари проходять у порядку з форми', () => {
    const ids = [id('a'), id('b')]
    expect(acceptedPhotos(ids.map(url), ids, folder, empty, 6)).toEqual({
      urls: ids.map(url),
      publicIds: ids,
    })
  })

  it('чуже, непарне й дублікати відкидаються', () => {
    const out = acceptedPhotos(
      [url(id('a')), url('zunor/users/other/jobs/x'), url(id('a')), 'https://evil.com/x.jpg', 42],
      [id('a'), 'zunor/users/other/jobs/x', id('a'), 'evil', id('c')],
      folder,
      empty,
      10,
    )
    expect(out).toEqual({ urls: [url(id('a'))], publicIds: [id('a')] })
  })

  // Посилання без пари не має publicId — отже, його нічим перевірити.
  it('масиви різної довжини — лише спільна частина', () => {
    expect(acceptedPhotos([url(id('a')), url(id('b'))], [id('a')], folder, empty, 10).urls).toEqual([
      url(id('a')),
    ])
  })

  it('не масиви — порожньо', () => {
    expect(acceptedPhotos('усі мої фото', { a: 1 }, folder, empty, 10)).toEqual(empty)
  })

  it('стеля ріже вхід, а не результат', () => {
    const ids = Array.from({ length: 50 }, (_, i) => id(`p${i}`))
    expect(acceptedPhotos(ids.map(url), ids, folder, empty, 6).publicIds).toEqual(ids.slice(0, 6))
  })

  it('пара, що вже була збережена, лишається — навіть стара', () => {
    const existing = { urls: ['https://res.cloudinary.com/c/old.jpg'], publicIds: ['legacy'] }
    expect(acceptedPhotos(existing.urls, existing.publicIds, folder, existing, 6)).toEqual(existing)
  })

  // «Вже було» — це пара цілком: старий publicId з новим посиланням не
  // проходить як збережений.
  it('збережений publicId з іншим посиланням — відкидається', () => {
    const existing = { urls: ['https://res.cloudinary.com/c/old.jpg'], publicIds: ['legacy'] }
    expect(
      acceptedPhotos(['https://res.cloudinary.com/attacker/x.jpg'], ['legacy'], folder, existing, 6),
    ).toEqual(empty)
  })
})

describe('removedOwnIds — що можна стерти з хмари', () => {
  it('лише те, що зникло, і лише зі своєї теки', () => {
    const own = `zunor/users/${USER}/jobs/drop`
    const keep = `zunor/users/${USER}/jobs/keep`
    expect(
      removedOwnIds(
        [
          own,
          keep,
          'zunor/users/other/jobs/x',
          'zunor/users/other/avatar/profile',
          `zunor/users/${USER}/../other/avatar/profile`,
          'legacy-id',
        ],
        [keep],
        USER,
      ),
    ).toEqual([own])
  })
})
