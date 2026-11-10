import { json, error } from '@sveltejs/kit'
import { runQueuedWave, verifyWaveRequest } from '$lib/server/dispatch'
import type { RequestHandler } from './$types'

/**
 * POST /api/dispatch/wave — чергова хвиля розсилки від черги QStash
 * (лише Vercel; $lib/server/dispatch/queue.ts). Тіло — { jobId }.
 *
 * Пускає лише підписаний нашими ключами QStash виклик саме на цю адресу:
 * інакше будь-хто міг би смикати розсилку. Чужий — 401 без жодної роботи.
 *
 * Помилку хвилі НЕ ковтаємо: 500 — і QStash повторить сам. Хвиля
 * ідемпотентна (номер відпрацьованої лежить у заявці), тож повтор чи
 * зайвий виклик нічого не дублюють.
 */
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.text()
  const signature = request.headers.get('upstash-signature')
  if (!(await verifyWaveRequest(signature, body))) {
    throw error(401, 'Unauthorized')
  }

  let jobId: unknown
  try {
    jobId = (JSON.parse(body) as { jobId?: unknown })?.jobId
  } catch {
    throw error(400, 'Invalid JSON')
  }
  // id заявки — cuid; стеля на довжину, щоб сміття не йшло в запит.
  if (typeof jobId !== 'string' || jobId.length === 0 || jobId.length > 64) {
    throw error(400, 'jobId required')
  }

  const result = await runQueuedWave(jobId)
  return json({ ok: true, kind: result.kind })
}
