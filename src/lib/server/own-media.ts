// ЄДИНЕ правило «цей файл у Cloudinary — саме цієї людини».
//
// Клієнт вантажить файл у хмару сам (підпис — POST /api/upload/signature),
// а серверу присилає лише посилання й publicId. Обидва — недовірений ввід:
//
//   • publicId потім іде в `cloudinary.uploader.destroy`. Доки його брали з
//     тіла запиту без перевірки, чужий id (а id аватара вгадується:
//     `zunor/users/<id>/avatar/profile`) можна було записати собі й наступним
//     збереженням профілю стерти чужий файл;
//   • посилання показується іншим людям. Чужа хмара Cloudinary, тип `fetch`
//     чи трансформація з накладанням — це вміст, який ми не контролюємо:
//     його можна підмінити після модерації й рахувати, хто дивився.
//
// Тому приймається лише пара «посилання + publicId», де publicId лежить у
// теці цієї людини, а посилання — рівно те, що віддає завантаження
// (`secure_url`): наша хмара, `/<тип>/upload/`, необовʼязкова версія,
// publicId, розширення. Усе інше — не наше.
//
// Новий шлях, що пише посилання на файл у базу чи стирає файл із хмари, —
// лише через ці функції (AGENTS, 2.2).

import { env } from '$env/dynamic/private'

/** Тека людини: аватар, фото заявок, портфоліо. Зі слешем — щоб `user-1` не забрав `user-10`. */
export const userFolder = (userId: string) => `zunor/users/${userId}/`
export const avatarFolder = (userId: string) => `zunor/users/${userId}/avatar/`
export const jobsFolder = (userId: string) => `zunor/users/${userId}/jobs/`
/** Вкладення чату цієї людини. */
export const chatFolder = (userId: string) => `zunor/chat/${userId}/`

const PUBLIC_ID_MAX = 300
/** Те, з чого складаються наші publicId: тека, згенероване імʼя, розширення. */
const PUBLIC_ID_RE = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/

/**
 * publicId лежить у цій теці. `..` відкидається окремо: `startsWith` його
 * пропускає, а шлях `свій/../чужий/avatar/profile` веде вже не у свою теку.
 */
export function isPublicIdIn(publicId: unknown, folder: string): publicId is string {
  return (
    typeof publicId === 'string' &&
    publicId.length <= PUBLIC_ID_MAX &&
    publicId.startsWith(folder) &&
    publicId.length > folder.length &&
    PUBLIC_ID_RE.test(publicId) &&
    !publicId.includes('..')
  )
}

/** publicId із теки цієї людини (`zunor/users/<id>/`) — його можна стирати. */
export function isOwnPublicId(publicId: unknown, userId: string): publicId is string {
  return isPublicIdIn(publicId, userFolder(userId))
}

const RESOURCE_TYPES = ['image', 'raw', 'video']

export interface OwnUploadOptions {
  /** Лише картинка (`/image/upload/`): аватар, фото заявки, портфоліо, фото в чаті. */
  image?: boolean
}

/**
 * Пара «посилання + publicId» — свіже завантаження в цю теку нашої хмари.
 * Посилання мусить бути рівно `secure_url` завантаження:
 *   https://res.cloudinary.com/<наша хмара>/<тип>/upload/[v123/]<publicId>[.ext]
 */
export function isOwnUpload(
  url: unknown,
  publicId: unknown,
  folder: string,
  options: OwnUploadOptions = {},
): boolean {
  if (typeof url !== 'string' || !isPublicIdIn(publicId, folder)) return false

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  if (parsed.hostname !== 'res.cloudinary.com') return false
  if (parsed.username || parsed.password || parsed.port) return false
  if (parsed.search || parsed.hash) return false

  // res.cloudinary.com обслуговує всі акаунти світу: перший сегмент шляху —
  // імʼя хмари, і воно мусить бути НАШИМ.
  const cloud = env.CLOUDINARY_CLOUD_NAME
  const [, cloudName, resourceType, delivery, ...rest] = parsed.pathname.split('/')
  if (!cloud || cloudName !== cloud) return false
  // `upload`, а не `fetch` чи `private`: fetch віддає чужу адресу крізь нашу
  // хмару, тобто вміст знову не наш.
  if (delivery !== 'upload') return false
  if (options.image ? resourceType !== 'image' : !RESOURCE_TYPES.includes(resourceType)) {
    return false
  }

  // Після `upload/` — лише версія й сам файл. Трансформацій тут немає:
  // накладання (`l_fetch:…`) підтягує чужу картинку поверх нашої.
  if (rest[0] && /^v\d+$/.test(rest[0])) rest.shift()
  const tail = rest.join('/')
  if (tail === publicId) return true
  const dot = tail.lastIndexOf('.')
  return (
    dot > 0 &&
    tail.slice(0, dot) === publicId &&
    /^[A-Za-z0-9]{1,5}$/.test(tail.slice(dot + 1))
  )
}

/** Аватар людини з входу через Google — його віддає сам Google, файла в хмарі немає. */
const GOOGLE_AVATAR_PREFIX = 'https://lh3.googleusercontent.com/'

export interface Avatar {
  avatar: string | null
  avatarPublicId: string | null
}

/** Те, що вже лежить у профілі (рядок бази; полів може не бути). */
export interface StoredAvatar {
  avatar?: string | null
  avatarPublicId?: string | null
}

/**
 * Що записати в профіль як фото. Приймається:
 *   • порожнє — фото прибрали;
 *   • та сама пара, що вже лежить у профілі (вона пройшла перевірку, коли
 *     її додавали; старі профілі не ламаємо);
 *   • фото з Google-акаунта — без publicId;
 *   • свіже завантаження у свою теку аватара.
 * Усе інше лишає профіль як був: мовчки стерти людині фото через кривий
 * запит гірше, ніж проігнорувати зміну.
 */
export function acceptedAvatar(
  rawUrl: unknown,
  rawId: unknown,
  userId: string,
  existing: StoredAvatar,
): Avatar {
  if (typeof rawUrl !== 'string' || !rawUrl) return { avatar: null, avatarPublicId: null }
  const id = typeof rawId === 'string' && rawId ? rawId : null

  if (rawUrl === existing.avatar && id === (existing.avatarPublicId || null)) {
    return { avatar: rawUrl, avatarPublicId: id }
  }
  if (rawUrl.startsWith(GOOGLE_AVATAR_PREFIX) && rawUrl.length <= 2048) {
    return { avatar: rawUrl, avatarPublicId: null }
  }
  if (isOwnUpload(rawUrl, id, avatarFolder(userId), { image: true })) {
    return { avatar: rawUrl, avatarPublicId: id }
  }
  return {
    avatar: existing.avatar || null,
    avatarPublicId: existing.avatarPublicId || null,
  }
}

export interface Photos {
  urls: string[]
  publicIds: string[]
}

/**
 * Фото з тіла запиту, що пройшли перевірку, у порядку з форми: пара, яка
 * вже була збережена, лишається як є; нова — лише своє завантаження в
 * `folder`. Решта мовчки відкидається. `max` — стеля на довжину масивів.
 */
export function acceptedPhotos(
  rawUrls: unknown,
  rawIds: unknown,
  folder: string,
  existing: Photos,
  max: number,
): Photos {
  const urls = Array.isArray(rawUrls) ? rawUrls.slice(0, max) : []
  const ids = Array.isArray(rawIds) ? rawIds.slice(0, max) : []

  const out: Photos = { urls: [], publicIds: [] }
  for (let i = 0; i < Math.min(urls.length, ids.length); i++) {
    const url = urls[i]
    const id = ids[i]
    if (typeof url !== 'string' || typeof id !== 'string') continue
    if (out.publicIds.includes(id)) continue

    const kept = existing.publicIds.indexOf(id)
    const wasThere = kept !== -1 && existing.urls[kept] === url
    if (!wasThere && !isOwnUpload(url, id, folder, { image: true })) continue

    out.urls.push(url)
    out.publicIds.push(id)
  }
  return out
}

/** publicId, які були й зникли, — стирати можна лише ті, що з теки власника. */
export function removedOwnIds(before: string[], after: string[], userId: string): string[] {
  return before.filter((id) => !after.includes(id) && isOwnPublicId(id, userId))
}
