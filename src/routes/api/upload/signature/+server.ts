import { json } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import { signUploadParams } from '$lib/server/cloudinary'
import { limit } from '$lib/server/rate-limit'
import type { RequestHandler } from './$types'

const ALLOWED_KINDS = ['avatar', 'job', 'chat'] as const
type Kind = (typeof ALLOWED_KINDS)[number]
type ResourceType = 'image' | 'raw' | 'auto'

// * підпис — право покласти файл у нашу хмару, тому в нього входить перелік
// * форматів (`allowed_formats`): решту відхиляє сам Cloudinary. SVG немає
// * навмисно: це документ зі скриптами

/** Фото: аватар, заявка, портфоліо, фото в чаті. */
const IMAGE_FORMATS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'heic',
  'heif',
  'avif',
  'bmp',
  'tiff',
] as const

/** Файл у чаті — те саме, що пропонує вибір файлу в полі повідомлення. */
const FILE_FORMATS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'txt',
  'rtf',
  'csv',
  'zip',
  ...IMAGE_FORMATS,
] as const

function folderForKind(kind: Kind, userId: string): string {
  switch (kind) {
    case 'avatar':
      return `zunor/users/${userId}/avatar`
    case 'job':
      return `zunor/users/${userId}/jobs`
    case 'chat':
      return `zunor/chat/${userId}`
  }
}

/** Старі збірки застосунку `allowed_formats` не шлють: UPLOAD_SIGNATURE_LEGACY=1 дає підпис без обмеження. */
const legacySignature = () => env.UPLOAD_SIGNATURE_LEGACY === '1'

function tooMany(resetAt: number): Response {
  return new Response(JSON.stringify({ error: 'Too many uploads' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
    },
  })
}

export const POST: RequestHandler = async ({ request, locals }) => {
  // * не через requireApiUser: цей ендпоінт віддає 401 у власному форматі
  // * { error }, а гард кидає { message }. Джерело сесії єдине (locals),
  // * а тіло відповіді лишаємо як є, щоб не міняти контракт для клієнта
  const user = locals.user
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await limit(`upload-sign:${user.id}`, {
    points: 30,
    duration: 60_000,
  })
  if (!rl.success) return tooMany(rl.resetAt)
  // * підпис діє годину й не одноразовий, тож хвилинного ліміту мало: друга
  // * стеля — на годину
  const hourly = await limit(`upload-sign:h:${user.id}`, {
    points: 300,
    duration: 60 * 60_000,
  })
  if (!hourly.success) return tooMany(hourly.resetAt)

  const body = (await request.json().catch(() => null)) as {
    kind?: string
    resourceType?: ResourceType
  } | null

  if (!body || !body.kind) {
    return json({ error: 'Missing kind' }, { status: 400 })
  }
  if (!ALLOWED_KINDS.includes(body.kind as Kind)) {
    return json({ error: 'Invalid kind' }, { status: 400 })
  }

  const kind = body.kind as Kind
  const folder = folderForKind(kind, user.id)
  const requested: ResourceType =
    body.resourceType === 'image' ||
    body.resourceType === 'raw' ||
    body.resourceType === 'auto'
      ? body.resourceType
      : 'auto'

  // * аватар і фото заявки — завжди картинка, хоч би що просив клієнт. Чат —
  // * фото або файл: формати — за тим, що саме вантажать
  const resourceType: ResourceType = kind === 'chat' ? requested : 'image'
  const allowedFormats = legacySignature()
    ? undefined
    : resourceType === 'image'
      ? IMAGE_FORMATS
      : FILE_FORMATS

  // * для аватара — фіксований public_id щоб нове фото перезаписувало старе
  const publicId =
    kind === 'avatar' ? `zunor/users/${user.id}/avatar/profile` : undefined

  return json(
    signUploadParams({ folder, resourceType, publicId, allowedFormats }),
  )
}
