import { json, error } from '@sveltejs/kit'
import { runQueuedWave, verifyWaveRequest } from '$lib/server/dispatch'
import type { RequestHandler } from './$types'

/**
 * POST /api/dispatch/wave — хвиля розсилки від черги QStash (лише Vercel).
 * Пускає тільки підписаний виклик. Помилку хвилі не ковтаємо: 500 — і QStash
 * повторить сам; хвиля ідемпотентна.
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
  // * id заявки — cuid; стеля на довжину, щоб сміття не йшло в запит
  if (typeof jobId !== 'string' || jobId.length === 0 || jobId.length > 64) {
    throw error(400, 'jobId required')
  }

  const result = await runQueuedWave(jobId)
  return json({ ok: true, kind: result.kind })
}
