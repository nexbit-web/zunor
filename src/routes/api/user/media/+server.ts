import { json } from '@sveltejs/kit'
import { cloudinary } from '$lib/server/cloudinary'
import { prisma } from '$lib/server/prisma'
import { limit } from '$lib/server/rate-limit'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, locals }) => {
  // 401 у власному форматі { error } — див. коментар в upload/signature.
  const user = locals.user
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 })

  const rl = limit(`user-media:${user.id}`, {
    points: 30,
    duration: 60_000,
  })
  if (!rl.success) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
      },
    })
  }

  const body = (await request.json().catch(() => null)) as {
    kind?: string
    url?: string
    publicId?: string
  } | null

  if (!body?.kind) return json({ error: 'Missing kind' }, { status: 400 })

  const userId = user.id

  // publicId нижче перевіряється на префікс, а url раніше писався в базу
  // як є — тобто аватаром чи портфоліо можна було зробити будь-яке
  // посилання (чужий трекер, картинка з чужого сайту). Рендер від цього
  // рятує CSP (img-src дозволяє лише Cloudinary), але зберігати чуже
  // посилання в профілі однаково не треба: воно потім поїде в JSON API,
  // у листи й у JSON-LD, де CSP уже не діє.
  const isOwnCloudinaryUrl = (url: string, publicId: string): boolean => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return false
    }
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'res.cloudinary.com' &&
      // publicId вже прив'язаний до userId перевіркою префікса нижче,
      // тож збіг із ним і робить посилання «своїм».
      parsed.pathname.includes(publicId)
    )
  }

  // ── AVATAR ────────────────────────────────────────────────────────────
  if (body.kind === 'avatar') {
    if (!body.url || !body.publicId)
      return json({ error: 'Missing url or publicId' }, { status: 400 })

    if (!body.publicId.startsWith(`zunor/users/${userId}/avatar`))
      return json({ error: 'Forbidden' }, { status: 403 })

    if (!isOwnCloudinaryUrl(body.url, body.publicId))
      return json({ error: 'Forbidden' }, { status: 403 })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarPublicId: true },
    })

    await prisma.user.update({
      where: { id: userId },
      data: { avatar: body.url, avatarPublicId: body.publicId },
    })

    if (user?.avatarPublicId && user.avatarPublicId !== body.publicId) {
      try {
        await cloudinary.uploader.destroy(user.avatarPublicId)
      } catch (err) {
        console.error('[media:delete-old-avatar]', err)
      }
    }

    return json({ ok: true })
  }

  // ── PORTFOLIO ADD ─────────────────────────────────────────────────────
  if (body.kind === 'portfolio-add') {
    if (!body.url || !body.publicId)
      return json({ error: 'Missing url or publicId' }, { status: 400 })

    if (!body.publicId.startsWith(`zunor/users/${userId}/`))
      return json({ error: 'Forbidden' }, { status: 403 })

    if (!isOwnCloudinaryUrl(body.url, body.publicId))
      return json({ error: 'Forbidden' }, { status: 403 })

    const existing = await prisma.masterProfile.findUnique({
      where: { userId },
      select: { portfolioImages: true, portfolioImagesPublicIds: true },
    })

    if (existing) {
      // профіль є — додаємо
      if (existing.portfolioImages.length >= 6)
        return json({ error: 'Max 6 images' }, { status: 400 })

      // захист від дублікатів
      if (existing.portfolioImagesPublicIds.includes(body.publicId))
        return json({ ok: true })

      await prisma.masterProfile.update({
        where: { userId },
        data: {
          portfolioImages: [...existing.portfolioImages, body.url],
          portfolioImagesPublicIds: [
            ...existing.portfolioImagesPublicIds,
            body.publicId,
          ],
        },
      })
    } else {
      // профіль ще не існує — створюємо з першим фото
      await prisma.masterProfile.create({
        data: {
          userId,
          portfolioImages: [body.url],
          portfolioImagesPublicIds: [body.publicId],
        },
      })
    }

    return json({ ok: true })
  }

  // ── PORTFOLIO REMOVE ──────────────────────────────────────────────────
  if (body.kind === 'portfolio-remove') {
    if (!body.publicId)
      return json({ error: 'Missing publicId' }, { status: 400 })

    if (!body.publicId.startsWith(`zunor/users/${userId}/`))
      return json({ error: 'Forbidden' }, { status: 403 })

    const existing = await prisma.masterProfile.findUnique({
      where: { userId },
      select: { portfolioImages: true, portfolioImagesPublicIds: true },
    })

    const idx = existing?.portfolioImagesPublicIds.indexOf(body.publicId) ?? -1

    if (existing && idx !== -1) {
      await prisma.masterProfile.update({
        where: { userId },
        data: {
          portfolioImages: existing.portfolioImages.filter((_, i) => i !== idx),
          portfolioImagesPublicIds: existing.portfolioImagesPublicIds.filter(
            (_, i) => i !== idx,
          ),
        },
      })
    }

    // видаляємо з Cloudinary завжди
    try {
      await cloudinary.uploader.destroy(body.publicId)
    } catch (err) {
      console.error('[media:delete-portfolio]', err)
    }

    return json({ ok: true })
  }

  return json({ error: 'Invalid kind' }, { status: 400 })
}
