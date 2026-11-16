// * редагування заявки клієнтом: лише власник і лише відкрита. Валідатор той
// * самий, що при створенні; «сьогодні/завтра» пишуться датою; назва
// * перегенеровується, лише коли змінились її складові. Майстрам із пропозицією
// * — сповіщення. Розсилка не перезапускається

import { prisma } from './prisma'
import { Notify } from './notifications'
import { cloudinary } from './cloudinary'
import { sanitizeJobNote } from './job-copy'
import { acceptedJobPhotos, removedJobPhotos } from './job-attachments'
import { validateCleaningMetadata } from '$lib/categories/cleaning/validate'
import { generateTitle, type CleaningMetadata } from '$lib/categories/cleaning/title-gen'
import { QUICK_WHEN, resolveWhen } from '$lib/categories/cleaning/presets'
import { matchingFor } from '$lib/categories/matching'

export type EditResult =
  | { ok: true; changed: boolean }
  | { ok: false; status: 400 | 404 | 409; message: string }

/** Поля, яких форма не показує, але які заявка має від асистента. */
const KEPT_FROM_ASSISTANT = ['areaM2', 'effortAdjust'] as const

export async function editJob(
  userId: string,
  jobId: string,
  body: Record<string, unknown>,
  now = new Date(),
): Promise<EditResult> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      clientId: true,
      category: true,
      status: true,
      title: true,
      description: true,
      metadata: true,
      attachments: true,
      attachmentsPublicIds: true,
      createdAt: true,
    },
  })
  // * чужа — 404, а не 403: відповідь не підтверджує, що заявка існує
  if (!job || job.clientId !== userId) {
    return { ok: false, status: 404, message: 'Заявку не знайдено' }
  }
  if (job.status !== 'OPEN') {
    return {
      ok: false,
      status: 409,
      message: 'Заявку вже закрито — змінити її не можна',
    }
  }

  // * умови заявки
  const before = (job.metadata ?? {}) as Record<string, unknown>
  const raw =
    body.metadata && typeof body.metadata === 'object'
      ? { ...(body.metadata as Record<string, unknown>) }
      : null
  if (!raw) return { ok: false, status: 400, message: 'Некоректні дані заявки' }
  for (const key of KEPT_FROM_ASSISTANT) {
    if (raw[key] === undefined && before[key] !== undefined) raw[key] = before[key]
  }

  const validation = validateCleaningMetadata(raw)
  if (!validation.ok || !validation.clean) {
    return { ok: false, status: 400, message: validation.error ?? 'Некоректні дані заявки' }
  }
  const metadata = validation.clean
  if (QUICK_WHEN.some((w) => w.key === metadata.when)) {
    metadata.when = resolveWhen(metadata.when, now) ?? metadata.when
  }

  const sameWork = generateTitle(before as unknown as CleaningMetadata) === generateTitle(metadata)
  const title = sameWork ? job.title : generateTitle(metadata)

  // * опис і фото
  const description =
    body.description === undefined ? job.description : sanitizeJobNote(body.description)

  const photosBefore = {
    attachments: job.attachments,
    attachmentsPublicIds: job.attachmentsPublicIds,
  }
  const photos = acceptedJobPhotos(
    body.attachments,
    body.attachmentsPublicIds,
    userId,
    photosBefore,
  )

  // * відносне «завтра» в старій заявці й та сама дата з форми — не зміна:
  // * форма показує його датою, і «Зберегти» без правок не має нікого
  // * сповіщати
  const beforeDated = { ...before, when: resolveWhen(before.when, job.createdAt) ?? before.when }
  const changed =
    title !== job.title ||
    description !== job.description ||
    JSON.stringify(metadata) !== JSON.stringify(beforeDated) ||
    JSON.stringify(photos.attachmentsPublicIds) !==
      JSON.stringify(job.attachmentsPublicIds)
  if (!changed) return { ok: true, changed: false }

  // * перевірка статусу — в самому записі: між читанням і записом клієнт
  // * міг обрати майстра в іншій вкладці
  const { count } = await prisma.job.updateMany({
    where: { id: job.id, status: 'OPEN' },
    data: {
      title,
      description,
      metadata: metadata as unknown as object,
      effort: matchingFor(job.category).effort(metadata),
      attachments: photos.attachments,
      attachmentsPublicIds: photos.attachmentsPublicIds,
      editedAt: now,
    },
  })
  if (count === 0) {
    return { ok: false, status: 409, message: 'Заявку вже закрито — змінити її не можна' }
  }

  // * прибрані з заявки фото — з хмари, лише ПІСЛЯ запису: збій тут лишає
  // * зайвий файл, а не заявку з битим фото
  const gone = removedJobPhotos(photosBefore, photos, userId)
  if (gone.length) {
    await Promise.allSettled(gone.map((id) => cloudinary.uploader.destroy(id)))
  }

  await notifyProposers(job.id, title)
  return { ok: true, changed: true }
}

/** Майстри з чинною пропозицією, яким ще не висить непрочитане «змінено». */
async function notifyProposers(jobId: string, title: string): Promise<void> {
  const proposals = await prisma.proposal.findMany({
    where: { jobId, status: 'SENT' },
    select: { masterId: true },
  })
  if (!proposals.length) return

  const masterIds = [...new Set(proposals.map((p) => p.masterId))]
  const pending = await prisma.notification.findMany({
    where: { jobId, type: 'JOB_UPDATED', isRead: false, userId: { in: masterIds } },
    select: { userId: true },
  })
  const already = new Set(pending.map((n) => n.userId))

  await Promise.allSettled(
    masterIds
      .filter((id) => !already.has(id))
      .map((id) => Notify.jobUpdated(id, jobId, title)),
  )
}
