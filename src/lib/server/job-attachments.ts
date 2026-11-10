// Фото заявки при редагуванні: які пари «посилання + publicId» можна
// записати в базу.
//
// Правило — як для аватара й портфоліо (api/user/media): посилання лише
// з НАШОЇ хмари Cloudinary і лише на файл із теки цього користувача. Без
// перевірки хмари підходив би чужий акаунт Cloudinary з нашим publicId у
// шляху — і фото помешкання можна було б підмінити вже після публікації.
// Фото, що вже були в заявці, лишаються як є: вони пройшли перевірку,
// коли їх додавали.

import { env } from '$env/dynamic/private'

/** Стеля, як у POST /api/jobs. */
export const MAX_JOB_PHOTOS = 10

export interface JobPhotos {
  attachments: string[]
  attachmentsPublicIds: string[]
}

/** Свіжо завантажене фото заявки цього користувача з нашої хмари. */
export function isOwnJobPhoto(url: string, publicId: string, userId: string): boolean {
  if (!publicId.startsWith(`zunor/users/${userId}/jobs/`)) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') return false
  const [, cloudName] = parsed.pathname.split('/')
  if (!cloudName || cloudName !== env.CLOUDINARY_CLOUD_NAME) return false
  return parsed.pathname.includes(publicId)
}

/**
 * Фото з тіла запиту, що пройшли перевірку, у порядку з форми. Пара, якої
 * немає в заявці й яка не своя, мовчки відкидається — як і в POST.
 */
export function acceptedJobPhotos(
  rawUrls: unknown,
  rawIds: unknown,
  userId: string,
  existing: JobPhotos,
): JobPhotos {
  const urls = Array.isArray(rawUrls) ? rawUrls.slice(0, MAX_JOB_PHOTOS) : []
  const ids = Array.isArray(rawIds) ? rawIds.slice(0, MAX_JOB_PHOTOS) : []

  const out: JobPhotos = { attachments: [], attachmentsPublicIds: [] }
  for (let i = 0; i < Math.min(urls.length, ids.length); i++) {
    const url = urls[i]
    const id = ids[i]
    if (typeof url !== 'string' || typeof id !== 'string') continue
    if (out.attachmentsPublicIds.includes(id)) continue

    const kept = existing.attachmentsPublicIds.indexOf(id)
    const wasThere = kept !== -1 && existing.attachments[kept] === url
    if (!wasThere && !isOwnJobPhoto(url, id, userId)) continue

    out.attachments.push(url)
    out.attachmentsPublicIds.push(id)
  }
  return out
}

/** publicId, які були в заявці й зникли з неї, — лише з теки власника. */
export function removedJobPhotos(before: JobPhotos, after: JobPhotos, userId: string): string[] {
  return before.attachmentsPublicIds.filter(
    (id) =>
      !after.attachmentsPublicIds.includes(id) && id.startsWith(`zunor/users/${userId}/`),
  )
}
