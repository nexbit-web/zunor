import { error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import { limit } from '$lib/server/rate-limit'
import { runZunorTurnStream, runZunorTurn } from '$lib/server/zunor/agent'
import { turnLog, withTurnLog } from '$lib/server/zunor/turn-log'
import type { ZunorClientMessage, ZunorResponse } from '$lib/types/zunor'
import type { RequestHandler } from './$types'

const MAX_MESSAGES = 24
const MAX_MESSAGE_LEN = 1200

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireApiUser(locals)
  const userId = user.id

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

  // Анкету беремо з БД, а не з тіла запиту: інакше клієнт підставив би
  // в промпт будь-що в обхід валідації й лімітів.
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { city: true, aiProfile: true },
  })
  const city = me?.city ?? null
  const aiProfile = me?.aiProfile ?? null

  // ── Усе провалідовано → відкриваємо потік ──
  const encoder = new TextEncoder()
  // Клієнт натиснув «Стоп» або закрив вкладку → сервер скасовує потік.
  // Тоді обриваємо й запит до моделі: відповідь, яку ніхто не прочитає,
  // однаково оплачується потокенно.
  const gone = new AbortController()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Після скасування enqueue кидає — і цей виняток запустив би
      // фолбек-хід, тобто ДРУГИЙ платний запит у порожнечу.
      const send = (
        obj: { t: 'text'; d: string } | { t: 'final'; r: ZunorResponse },
      ) => {
        if (gone.signal.aborted) return
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      }

      await withTurnLog({ userId, city }, async () => {
        try {
          const final = await runZunorTurnStream(
            history,
            city,
            (delta) => {
              send({ t: 'text', d: delta })
            },
            aiProfile,
            gone.signal,
          )
          turnLog().final(final)
          send({ t: 'final', r: final })
        } catch (err) {
          if (gone.signal.aborted) {
            turnLog().note('Клієнт зупинив відповідь')
            return
          }
          console.error('[zunor] stream turn failed:', err)
          turnLog().note(`ХІД УПАВ: ${String(err)}`)

          try {
            const final = await runZunorTurn(history, city, aiProfile)
            turnLog().final(final)
            send({ t: 'final', r: final })
          } catch (fallbackErr) {
            console.error('[zunor] fallback turn failed:', fallbackErr)
            send({
              t: 'final',
              r: {
                kind: 'message',
                reply: 'Zunor тимчасово недоступний. Спробуйте ще раз.',
              },
            })
          }
        }
      })

      if (!gone.signal.aborted) controller.close()
    },
    cancel() {
      gone.abort()
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
