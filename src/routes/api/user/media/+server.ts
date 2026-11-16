import { json } from '@sveltejs/kit'
import { cloudinary } from '$lib/server/cloudinary'
import {
  avatarFolder,
  isOwnPublicId,
  isOwnUpload,
  userFolder,
} from '$lib/server/own-media'
import { prisma } from '$lib/server/prisma'
import { forgetMasterPage } from '$lib/server/master-page'
import { refreshSessionUser } from '$lib/server/sessions'
import { limit } from '$lib/server/rate-limit'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, locals }) => {
  // * 401 у власному форматі { error } — див. коментар в upload/signature
  const user = locals.user
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await limit(`user-media:${user.id}`, {
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

  // * «своє посилання» — одне правило на весь сервер (own-media): тека цієї
  // * людини й рівно адреса завантаження з нашої хмари

  // * AVATAR
  if (body.kind === 'avatar') {
    if (!body.url || !body.publicId)
      return json({ error: 'Missing url or publicId' }, { status: 400 })

    if (!isOwnUpload(body.url, body.publicId, avatarFolder(userId), { image: true }))
      return json({ error: 'Forbidden' }, { status: 403 })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarPublicId: true },
    })

    await prisma.user.update({
      where: { id: userId },
      data: { avatar: body.url, avatarPublicId: body.publicId },
    })
    await Promise.all([refreshSessionUser(userId), forgetMasterPage(userId)])

    // * старий файл стираємо, лише якщо він із теки цієї людини. id у базі
    // * колись писався з тіла запиту без перевірки: чужий id, підкладений
    // * собі в профіль, наступною зміною фото стирав чужий файл із хмари
    if (
      user?.avatarPublicId &&
      user.avatarPublicId !== body.publicId &&
      isOwnPublicId(user.avatarPublicId, userId)
    ) {
      try {
        await cloudinary.uploader.destroy(user.avatarPublicId)
      } catch (err) {
        console.error('[media:delete-old-avatar]', err)
      }
    }

    return json({ ok: true })
  }

  // ── AVATAR REMOVE ─────────────────────────────────────────────────────
  // Фото зникає і з профілю, і з хмари. Що видаляти, вирішує СЕРВЕР за
  // userId із сесії, а не тіло запиту: чужий файл так не зачепити.
  if (body.kind === 'avatar-remove') {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarPublicId: true },
    })

    await prisma.user.update({
      where: { id: userId },
      data: { avatar: null, avatarPublicId: null },
    })
    await Promise.all([refreshSessionUser(userId), forgetMasterPage(userId)])

    // * аватар лежить у фіксованому publicId і може бути там, навіть якщо в базу
    // * не потрапив; плюс старий id із бази, якщо він наш
    const ids = new Set([`zunor/users/${userId}/avatar/profile`])
    if (isOwnPublicId(user?.avatarPublicId, userId)) {
      ids.add(user.avatarPublicId)
    }
    await Promise.all(
      [...ids].map((id) =>
        cloudinary.uploader
          .destroy(id, { resource_type: 'image', invalidate: true })
          .catch((err) => console.error('[media:delete-avatar]', err)),
      ),
    )

    return json({ ok: true })
  }

  // * PORTFOLIO ADD
  if (body.kind === 'portfolio-add') {
    if (!body.url || !body.publicId)
      return json({ error: 'Missing url or publicId' }, { status: 400 })

    if (!isOwnUpload(body.url, body.publicId, userFolder(userId), { image: true }))
      return json({ error: 'Forbidden' }, { status: 403 })

    const existing = await prisma.masterProfile.findUnique({
      where: { userId },
      select: { portfolioImages: true, portfolioImagesPublicIds: true },
    })

    if (existing) {
      // * профіль є — додаємо
      if (existing.portfolioImages.length >= 6)
        return json({ error: 'Max 6 images' }, { status: 400 })

      // * захист від дублікатів
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
      // * профіль ще не існує — створюємо з першим фото
      await prisma.masterProfile.create({
        data: {
          userId,
          portfolioImages: [body.url],
          portfolioImagesPublicIds: [body.publicId],
        },
      })
    }

    await forgetMasterPage(userId)
    return json({ ok: true })
  }

  // * PORTFOLIO REMOVE
  if (body.kind === 'portfolio-remove') {
    if (!body.publicId)
      return json({ error: 'Missing publicId' }, { status: 400 })

    if (!isOwnPublicId(body.publicId, userId))
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
      await forgetMasterPage(userId)
    }

    // * видаляємо з Cloudinary завжди
    try {
      await cloudinary.uploader.destroy(body.publicId)
    } catch (err) {
      console.error('[media:delete-portfolio]', err)
    }

    return json({ ok: true })
  }

  return json({ error: 'Invalid kind' }, { status: 400 })
}
