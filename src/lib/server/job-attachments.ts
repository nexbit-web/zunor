// * фото заявки: які пари «посилання + publicId» можна записати — при створенні
// * й редагуванні. Правило одне на всіх — own-media; що вже в заявці, лишається

import {
  acceptedPhotos,
  isOwnUpload,
  jobsFolder,
  removedOwnIds,
} from './own-media'

/** Стеля на кількість фото заявки. */
export const MAX_JOB_PHOTOS = 10

export interface JobPhotos {
  attachments: string[]
  attachmentsPublicIds: string[]
}

/** Заявка без фото — «існуючих» пар немає (створення). */
export const NO_JOB_PHOTOS: JobPhotos = { attachments: [], attachmentsPublicIds: [] }

/** Свіжо завантажене фото заявки цього користувача з нашої хмари. */
export function isOwnJobPhoto(url: string, publicId: string, userId: string): boolean {
  return isOwnUpload(url, publicId, jobsFolder(userId), { image: true })
}

/**
 * Фото з тіла запиту, що пройшли перевірку, у порядку з форми. Пара, якої
 * немає в заявці й яка не своя, мовчки відкидається.
 */
export function acceptedJobPhotos(
  rawUrls: unknown,
  rawIds: unknown,
  userId: string,
  existing: JobPhotos,
): JobPhotos {
  const photos = acceptedPhotos(
    rawUrls,
    rawIds,
    jobsFolder(userId),
    { urls: existing.attachments, publicIds: existing.attachmentsPublicIds },
    MAX_JOB_PHOTOS,
  )
  return { attachments: photos.urls, attachmentsPublicIds: photos.publicIds }
}

/** publicId, які були в заявці й зникли з неї, — лише з теки власника. */
export function removedJobPhotos(before: JobPhotos, after: JobPhotos, userId: string): string[] {
  return removedOwnIds(before.attachmentsPublicIds, after.attachmentsPublicIds, userId)
}
