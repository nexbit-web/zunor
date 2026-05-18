// src/routes/api/upload/signature/+server.ts
import { json } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { signUploadParams } from '$lib/cloudinary'
import { limit } from '$lib/rate-limit'
import type { RequestHandler } from './$types'

const ALLOWED_KINDS = ['avatar', 'job', 'chat'] as const
type Kind = (typeof ALLOWED_KINDS)[number]

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

export const POST: RequestHandler = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 })

  const rl = limit(`upload-sign:${session.user.id}`, {
    points: 30,
    duration: 60_000,
  })
  if (!rl.success) {
    return new Response(JSON.stringify({ error: 'Too many uploads' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
      },
    })
  }

  const body = (await request.json().catch(() => null)) as {
    kind?: string
    resourceType?: 'image' | 'raw' | 'auto'
  } | null

  if (!body || !body.kind) {
    return json({ error: 'Missing kind' }, { status: 400 })
  }
  if (!ALLOWED_KINDS.includes(body.kind as Kind)) {
    return json({ error: 'Invalid kind' }, { status: 400 })
  }

  const kind = body.kind as Kind
  const folder = folderForKind(kind, session.user.id)
  const resourceType =
    body.resourceType === 'image' ||
    body.resourceType === 'raw' ||
    body.resourceType === 'auto'
      ? body.resourceType
      : 'auto'

  // Для аватара — фіксований public_id щоб нове фото перезаписувало старе
  const publicId =
    kind === 'avatar'
      ? `zunor/users/${session.user.id}/avatar/profile`
      : undefined

  return json(signUploadParams({ folder, resourceType, publicId }))
}
