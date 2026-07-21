// src/routes/api/zunor/chat/+server.ts
//
// POST /api/zunor/chat — один хід діалогу з Zunor-агентом.
// Endpoint НЕ створює заявку: драфт підтверджує людина, і тоді клієнт
// викликає звичайний POST /api/jobs (валідація №2, dispatch, свій rate-limit).
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { limit } from '$lib/rate-limit'
import { runZunorTurn } from '$lib/server/zunor/agent'
import type { ZunorClientMessage } from '$lib/types/zunor'
import type { RequestHandler } from './$types'

// Стелі вводу: контроль витрат токенів + захист від сміття
const MAX_MESSAGES = 24
const MAX_MESSAGE_LEN = 1200

export const POST: RequestHandler = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')
  const userId = session.user.id

  // Дві стелі: сплеск (хвилина) і добовий бюджет. LLM-виклики коштують грошей.
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

  // Санітизація історії: тільки user/assistant, тільки рядки, з обрізкою.
  // Історію шле клієнт — довіряти їй не можна: роль system звідси не пройде,
  // довжина і кількість повідомлень обмежені.
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

  // Місто — з профілю: агенту заборонено його питати
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { city: true },
  })

  try {
    return json(await runZunorTurn(history, me?.city ?? null))
  } catch (err) {
    console.error('[zunor] turn failed:', err)
    throw error(502, 'Zunor тимчасово недоступний. Спробуйте ще раз')
  }
}
