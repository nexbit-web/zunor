// Черга хвиль для Vercel (runtime.ts). Таймер setTimeout там не доживає до
// хвилі 2 (функцію заморожують після відповіді), тож хвилі 2–4 ставить
// Upstash QStash: відкладений HTTP-виклик POST /api/dispatch/wave у
// потрібну хвилину. На Hostinger черга не потрібна — хвилі ведуть таймери
// процесу (scheduler.ts).
//
// Надійність та сама, що з таймерами: номер відпрацьованої хвилі пишеться в
// заявку, хвиля ідемпотентна, а загублене підбирає відновлення (крон). Тож
// зайвий виклик нічого не ламає, а пропущений — підбереться.
//
// Без QSTASH_* на Vercel хвилі 2–4 прийдуть лише з кроном — тобто із
// запізненням до доби. На Vercel черга обовʼязкова.

import { Client, Receiver } from '@upstash/qstash'
import { env } from '$env/dynamic/private'
import { FINAL_WAVE, waveStartsAt } from './core/waves'
import { dispatchJob } from './dispatch'
import type { DispatchResult, JobRef } from './types'

const client = env.QSTASH_TOKEN
  ? new Client({
      token: env.QSTASH_TOKEN,
      // Регіональна адреса QStash (EU / US) — з консолі Upstash.
      ...(env.QSTASH_URL ? { baseUrl: env.QSTASH_URL } : {}),
    })
  : null

const receiver =
  env.QSTASH_CURRENT_SIGNING_KEY && env.QSTASH_NEXT_SIGNING_KEY
    ? new Receiver({
        currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
        nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
      })
    : null

export const queueEnabled = client !== null

/** Повтори самого QStash, якщо виклик хвилі відповів помилкою. */
const QUEUE_RETRIES = 3

function waveUrl(): string | null {
  const base = env.BETTER_AUTH_URL?.replace(/\/+$/, '')
  return base ? `${base}/api/dispatch/wave` : null
}

let warned = false

/**
 * Поставити хвилю заявки через delaySec. `dedupe` — та сама хвиля,
 * запланована вдруге (відновлення), не дублює виклик. false — черги немає.
 */
export async function enqueueWave(
  jobId: string,
  delaySec: number,
  dedupe?: string,
): Promise<boolean> {
  const url = waveUrl()
  if (!client || !url) {
    if (!warned) {
      warned = true
      console.warn(
        '[dispatch] QSTASH_TOKEN чи BETTER_AUTH_URL не задано — хвилі 2–4 ' +
          'прийдуть лише з кроном відновлення',
      )
    }
    return false
  }
  await client.publishJSON({
    url,
    body: { jobId },
    delay: Math.max(0, Math.ceil(delaySec)),
    retries: QUEUE_RETRIES,
    ...(dedupe ? { deduplicationId: dedupe } : {}),
  })
  return true
}

/**
 * Хвилі заявки, що ще попереду, — у чергу. Не кидає: заявка вже створена,
 * а хвилю, яку не вдалось поставити, підбере відновлення.
 */
export async function queueWaves(
  job: JobRef,
  now: number = Date.now(),
): Promise<void> {
  const planned: Promise<boolean>[] = []
  for (let wave = 2; wave <= FINAL_WAVE; wave++) {
    const delay = waveStartsAt(job.createdAt, wave).getTime() - now
    if (delay > 0)
      planned.push(enqueueWave(job.id, delay / 1000, `wave-${job.id}-${wave}`))
  }
  const results = await Promise.allSettled(planned)
  for (const r of results) {
    if (r.status === 'rejected')
      console.error(
        `[dispatch] job=${job.id} wave not queued, left to recovery:`,
        r.reason,
      )
  }
}

/**
 * Виклик від QStash справжній: підпис ключами нашого акаунта й адреса саме
 * цього ендпоінта. Без ключів підпису — ніхто не проходить.
 */
export async function verifyWaveRequest(
  signature: string | null,
  body: string,
): Promise<boolean> {
  const url = waveUrl()
  if (!receiver || !signature || !url) return false
  try {
    return await receiver.verify({ signature, body, url })
  } catch {
    return false
  }
}

/**
 * Хвиля з черги. На відміну від runWave, помилку НЕ ковтає: ендпоінт
 * відповість 500, і QStash повторить виклик сам.
 */
export function runQueuedWave(jobId: string): Promise<DispatchResult> {
  return dispatchJob(jobId)
}
