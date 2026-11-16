import { v2 as cloudinary } from 'cloudinary'
import { env } from '$env/dynamic/private'

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
})

export { cloudinary }

export function signUploadParams(params: {
  folder: string
  resourceType?: 'image' | 'raw' | 'auto'
  publicId?: string // фіксований ID для overwrite
  /**
   * Які формати Cloudinary прийме за цим підписом (`allowed_formats`).
   * Параметр ПІДПИСАНИЙ: клієнт мусить надіслати його дослівно, а прибрати
   * чи змінити не може — підпис не зійдеться, і файл не приймуть.
   */
  allowedFormats?: readonly string[]
}): {
  signature: string
  timestamp: number
  apiKey: string
  cloudName: string
  folder: string
  resourceType: 'image' | 'raw' | 'auto'
  publicId?: string
  /** Надіслати в Cloudinary полем `allowed_formats`, як є. */
  allowedFormats?: string
} {
  const timestamp = Math.round(Date.now() / 1000)
  const folder = params.folder
  const resourceType = params.resourceType ?? 'auto'

  const toSign: Record<string, string | number> = { timestamp, folder }
  if (params.publicId) {
    toSign.public_id = params.publicId
    toSign.overwrite = 1
  }
  const allowedFormats = params.allowedFormats?.length
    ? params.allowedFormats.join(',')
    : undefined
  if (allowedFormats) toSign.allowed_formats = allowedFormats

  const signature = cloudinary.utils.api_sign_request(
    toSign,
    env.CLOUDINARY_API_SECRET as string,
  )

  return {
    signature,
    timestamp,
    apiKey: env.CLOUDINARY_API_KEY as string,
    cloudName: env.CLOUDINARY_CLOUD_NAME as string,
    folder,
    resourceType,
    ...(params.publicId ? { publicId: params.publicId } : {}),
    ...(allowedFormats ? { allowedFormats } : {}),
  }
}
