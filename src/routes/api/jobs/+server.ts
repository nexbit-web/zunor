import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import { limit } from '$lib/server/rate-limit'
import { startWaves } from '$lib/server/dispatch'
import { JOB_LIFETIME_MS } from '$lib/server/job-lifetime'
import { CATEGORY_SLUG } from '$lib/categories/cleaning/presets'
import { validateCleaningMetadata } from '$lib/categories/cleaning/validate'
import { generateTitle } from '$lib/categories/cleaning/title-gen'
import { sanitizeJobTitle, sanitizeJobDescription } from '$lib/server/job-copy'
import { getDistricts } from '$lib/server/reference'
import { cityDistricts, findDistrict } from '$lib/geo/districts'
import { matchingFor } from '$lib/categories/matching'
import type { RequestHandler } from './$types'

// GET тут навмисно немає: пагіновану видачу заявок (і «мої», і стрічку
// майстра) віддає /api/jobs/feed — саме в нього ходять master-feed.svelte
// і client-jobs.svelte. Тутешній GET?role=client|master дублював ту саму
// логіку без пагінації, з фронту не викликався і тихо розходився з feed.

/**
 * POST /api/jobs — створити заявку на прибирання і запустити dispatch.
 *
 * Категорія фіксована (прибирання). metadata валідується конфігом категорії,
 * title генерується сервером із metadata (клієнтському title не довіряємо),
 * місто й район беруться з профілю клієнта. Бюджет не питаємо.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireApiUser(locals)

  // 10 заявок на годину на користувача — захист від спаму стрічки майстрів.
  const rl = limit(`job:create:${user.id}`, {
    points: 10,
    duration: 60 * 60_000,
  })
  if (!rl.success) throw error(429, 'Забагато заявок. Спробуйте пізніше')

  const body = await request.json().catch(() => null)
  if (!body) throw error(400, 'Invalid JSON')

  // Уся структура заявки валідується на сервері — клієнтській формі не довіряємо.
  const validation = validateCleaningMetadata(body.metadata)
  if (!validation.ok || !validation.clean) {
    throw error(400, validation.error ?? 'Некоректні дані заявки')
  }
  const metadata = validation.clean

  // AI-потік (Zunor) передає title/description; ручна форма — ні.
  // Обидва санітизуються як недовірений ввід; фолбек — шаблонна генерація.
  const title = sanitizeJobTitle(body.title) ?? generateTitle(metadata)
  const aiDescription = sanitizeJobDescription(body.description)

  const note =
    typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : ''

  // Приймаємо лише наші Cloudinary-URL: чужі посилання у стрічці майстрів —
  // це і фішинг-вектор, і витік IP майстрів на сторонній сервер.
  const isOurUpload = (s: unknown): s is string =>
    typeof s === 'string' && s.startsWith('https://res.cloudinary.com/')
  const attachments = Array.isArray(body.attachments)
    ? body.attachments.filter(isOurUpload).slice(0, 10)
    : []
  const attachmentsPublicIds = Array.isArray(body.attachmentsPublicIds)
    ? body.attachmentsPublicIds
        .filter((s: unknown) => typeof s === 'string')
        .slice(0, 10)
    : []

  // Місто — з профілю клієнта. Без міста заявку не створюємо: інакше вона
  // потрапила б не до тих майстрів. Гард у hooks.server.ts це теж не пускає.
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { city: true, district: true },
  })
  const city = me?.city
  if (!city) throw error(400, 'Спочатку вкажіть місто у профілі')

  const [categoryExists, cityExists, allDistricts] = await Promise.all([
    prisma.category.findUnique({
      where: { slug: CATEGORY_SLUG },
      select: { id: true },
    }),
    prisma.city.findUnique({ where: { slug: city }, select: { id: true } }),
    getDistricts(),
  ])

  // Район — теж із профілю, а не з тіла запиту: з нього рахуються кільця
  // розсилки, і підставити чужий район означало б покликати не тих майстрів.
  // Немає району (старий профіль) — заявка піде всім, як і раніше.
  const district =
    findDistrict(cityDistricts(allDistricts, city), me?.district)?.slug ?? null
  if (!categoryExists) throw error(500, 'Категорію прибирання не налаштовано')
  if (!cityExists) throw error(400, 'Місто не знайдено')

  const expiresAt = new Date(Date.now() + JOB_LIFETIME_MS)

  const job = await prisma.job.create({
    data: {
      clientId: user.id,
      category: CATEGORY_SLUG,
      city,
      district,
      title,
      description: aiDescription ?? (note || null),
      metadata: metadata as unknown as object,
      // Обсяг рахує сервер із перевіреної metadata — від нього залежить,
      // кого розсилка кличе першим (dispatch/core/score.ts, crewFit).
      effort: matchingFor(CATEGORY_SLUG).effort(metadata),
      currency: 'UAH',
      attachments,
      attachmentsPublicIds,
      status: 'OPEN',
      expiresAt,
    },
    select: {
      id: true,
      title: true,
      category: true,
      city: true,
      createdAt: true,
    },
  })

  // Перша хвиля — одразу, решта — таймерами від createdAt. Не кидає: збій
  // хвилі повторюється, а заявка вже створена — відповідь клієнту не валимо.
  await startWaves(job)

  return json({ job }, { status: 201 })
}
