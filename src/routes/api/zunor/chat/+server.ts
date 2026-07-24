// src/routes/api/zunor/chat/+server.ts
//
// POST /api/zunor/chat — один хід діалогу з Zunor-агентом (СТРІМ).
// Віддає NDJSON-потік:
//   {"t":"text","d":"…"}   — шматок тексту (клієнт дописує одразу)
//   {"t":"final","r":{…}}  — фінал: draft/suggestions/очищений reply
// Endpoint НЕ створює заявку: драфт підтверджує людина → POST /api/jobs.
//
// Порядок: авторизація + rate-limit + валідація ДО відкриття потоку
// (щоб помилки йшли чесним HTTP-кодом). Помилки ПІД ЧАС стріму йдуть
// як final-подія — заголовки вже відправлені, код не змінити.
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { limit } from '$lib/rate-limit'
import { runZunorTurnStream } from '$lib/server/zunor/agent'
import type { ZunorClientMessage, ZunorResponse } from '$lib/types/zunor'
import type { RequestHandler } from './$types'

const MAX_MESSAGES = 24
const MAX_MESSAGE_LEN = 1200

export const POST: RequestHandler = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')
  const userId = session.user.id

  const burst = limit(`zunor:burst:${userId}`, { points: 20, duration: 60_000 })
  if (!burst.success) throw error(429, 'Занадто швидко. Хвилинку :)')
  const daily = limit(`zunor:daily:${userId}`, {
    points: 200,
    duration: 24 * 60 * 60_000,
  })
  if (!daily.success) throw error(429, 'Денний ліміт розмов вичерпано')

  const body = (await request.json().catch(() => null)) as {
    messages?: unknown
  } | null
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    throw error(400, 'Порожній діалог')
  }

  const history: ZunorClientMessage[] = body.messages
    .filter(
      (m): m is { role: 'user' | 'assistant'; content: string } =>
        !!m &&
        typeof m === 'object' &&
        typeof (m as Record<string, unknown>).content === 'string' &&
        ((m as Record<string, unknown>).role === 'user' ||
          (m as Record<string, unknown>).role === 'assistant'),
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, MAX_MESSAGE_LEN),
    }))

  if (history.length === 0) throw error(400, 'Порожній діалог')
  if (history[history.length - 1].role !== 'user') {
    throw error(400, 'Останнє повідомлення має бути від користувача')
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { city: true },
  })
  const city = me?.city ?? null

  // ── Усе провалідовано → відкриваємо потік ──
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (
        obj: { t: 'text'; d: string } | { t: 'final'; r: ZunorResponse },
      ) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))

      try {
        const final = await runZunorTurnStream(history, city, (delta) => {
          send({ t: 'text', d: delta })
        })
        send({ t: 'final', r: final })
      } catch (err) {
        console.error('[zunor] stream turn failed:', err)
        // Потік уже відкрито → generic-помилка як final, без внутрішніх деталей
        send({
          t: 'final',
          r: {
            kind: 'message',
            reply: 'Zunor тимчасово недоступний. Спробуйте ще раз.',
          },
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no', // вимкнути буферизацію проксі (nginx)
    },
  })
}
