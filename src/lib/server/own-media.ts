// * єдине правило «цей файл у Cloudinary — саме цієї людини». Клієнт вантажить
// * файл сам і присилає посилання й publicId — обидва недовірений ввід:
// * publicId іде в destroy, посилання бачать інші. Приймаємо лише свою теку й
// * рівно адресу завантаження з нашої хмари

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

// * `..` відкидаємо окремо: startsWith його пропускає, а шлях веде вже в чужу теку
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

/** Свіже завантаження в цю теку: res.cloudinary.com/<наша хмара>/<тип>/upload/[v123/]<publicId>[.ext] */
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

  // * res.cloudinary.com обслуговує всі акаунти світу — імʼя хмари мусить бути нашим
  const cloud = env.CLOUDINARY_CLOUD_NAME
  const [, cloudName, resourceType, delivery, ...rest] = parsed.pathname.split('/')
  if (!cloud || cloudName !== cloud) return false
  // * fetch віддає чужу адресу крізь нашу хмару
  if (delivery !== 'upload') return false
  if (options.image ? resourceType !== 'image' : !RESOURCE_TYPES.includes(resourceType)) {
    return false
  }

  // * без трансформацій: накладання (`l_fetch:…`) тягне чужу картинку поверх нашої
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

// * приймається: порожнє (фото прибрали), пара, що вже лежить у профілі, фото
// * з Google-акаунта, свіже завантаження у свою теку. Решта лишає профіль як був
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

// * збережена пара лишається як є, нова — лише своє завантаження в `folder`
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
