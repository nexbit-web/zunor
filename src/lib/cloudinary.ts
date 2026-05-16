// src/lib/cloudinary.ts
import { v2 as cloudinary } from 'cloudinary'
import { env } from '$env/dynamic/private'

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
})

export { cloudinary }

/**
 * Підписує параметри для signed upload з клієнта.
 * Клієнт використовує отримані поля у multipart-запиті на Cloudinary.
 */
export function signUploadParams(params: {
  folder: string
  resourceType?: 'image' | 'raw' | 'auto'
}): {
  signature: string
  timestamp: number
  apiKey: string
  cloudName: string
  folder: string
  resourceType: 'image' | 'raw' | 'auto'
} {
  const timestamp = Math.round(Date.now() / 1000)
  const folder = params.folder
  const resourceType = params.resourceType ?? 'auto'

  // Cloudinary signature рахується ТІЛЬКИ за тих параметрів, які
  // йдуть у POST. resourceType — у URL, не в підписі.
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    env.CLOUDINARY_API_SECRET as string,
  )

  return {
    signature,
    timestamp,
    apiKey: env.CLOUDINARY_API_KEY as string,
    cloudName: env.CLOUDINARY_CLOUD_NAME as string,
    folder,
    resourceType,
  }
}
