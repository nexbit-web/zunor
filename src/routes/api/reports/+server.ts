import { error, json } from '@sveltejs/kit'
import { prisma } from '$lib/server/prisma'
import { requireApiUser } from '$lib/server/guards'
import { limit } from '$lib/server/rate-limit'
import { safeTrigger, channels, events } from '$lib/server/pusher'
import {
  isReportReason,
  OTHER_MIN_LENGTH,
  TEXT_MAX_LENGTH,
} from '$lib/reports/reasons'
import type { RequestHandler } from './$types'

const DAY_MS = 24 * 60 * 60_000

/**
 * POST /api/reports — поскаржитися на людину.
 *
 * Тіло: { targetId, reason, text?, orderId? | chatId? | jobId? }.
 *
 * Контекст (замовлення, чат, заявка) необовʼязковий, але якщо названий —
 * скаржник і той, на кого скарга, мусять бути в ньому обидва: інакше
 * чужий id перетворював би скаргу на спосіб дізнатись, хто з ким працює
 * (відповідь «404» чи «ок»). Без контексту — скарга з профілю.
 *
 * Повтор тієї самої скарги за добу нового запису не створює, але
 * відповідає так само: людині не треба знати, що вона вже скаржилась.
 * Модератора CRM кличе подія report:new — у ній лише id і причина.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireApiUser(locals)

  const rl = limit(`report:${user.id}`, { points: 5, duration: 60 * 60_000 })
  if (!rl.success) error(429, 'Забагато скарг за годину. Спробуйте пізніше.')

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  if (!body) error(400, 'Некоректний запит')

  const targetId = typeof body.targetId === 'string' ? body.targetId : ''
  if (!targetId) error(400, 'Не вказано, на кого скарга')
  if (targetId === user.id) error(400, 'Не можна поскаржитися на себе')

  const reason = body.reason
  if (!isReportReason(reason)) error(400, 'Оберіть причину')

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (text.length > TEXT_MAX_LENGTH) {
    error(400, `Не більше ${TEXT_MAX_LENGTH} символів`)
  }
  if (reason === 'other' && text.length < OTHER_MIN_LENGTH) {
    error(400, 'Опишіть, що сталося')
  }

  const id = (key: string) =>
    typeof body[key] === 'string' && body[key] ? (body[key] as string) : null
  const orderId = id('orderId')
  const chatId = id('chatId')
  const jobId = id('jobId')
  if ([orderId, chatId, jobId].filter(Boolean).length > 1) {
    error(400, 'Некоректний запит')
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true },
  })
  if (!target) error(404, 'Не знайдено')

  // ─── Контекст: обидва мусять бути в ньому ───
  if (orderId) {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        OR: [
          { clientId: user.id, masterId: targetId },
          { clientId: targetId, masterId: user.id },
        ],
      },
      select: { id: true },
    })
    if (!order) error(404, 'Не знайдено')
  }

  if (chatId) {
    const members = await prisma.chatMember.count({
      where: { chatId, userId: { in: [user.id, targetId] } },
    })
    if (members !== 2) error(404, 'Не знайдено')
  }

  if (jobId) {
    // Майстер скаржиться на заявку (її автора) або клієнт — на майстра,
    // що відгукнувся на його заявку.
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        OR: [
          { clientId: targetId },
          { clientId: user.id, proposals: { some: { masterId: targetId } } },
        ],
      },
      select: { id: true },
    })
    if (!job) error(404, 'Не знайдено')
  }

  // ─── Повтор за добу — без нового запису ───
  const recent = await prisma.report.findFirst({
    where: {
      reporterId: user.id,
      targetId,
      status: 'OPEN',
      createdAt: { gte: new Date(Date.now() - DAY_MS) },
    },
    select: { id: true },
  })
  if (recent) return json({ ok: true })

  const report = await prisma.report.create({
    data: {
      reporterId: user.id,
      targetId,
      reason,
      text: text || null,
      orderId,
      chatId,
      jobId,
    },
    select: { id: true },
  })

  // Після запису: подія без бази — це скарга, якої модератор не знайде.
  await safeTrigger(channels.admin, events.reportNew, {
    reportId: report.id,
    reason,
  })

  return json({ ok: true }, { status: 201 })
}
