// Таймери хвиль у памʼяті процесу — швидкий шлях: база прокидається лише
// тоді, коли є робота (крон щохвилини не давав би Neon заснути). Надійність
// дає не таймер: номер відпрацьованої хвилі пишеться в заявку, і все, що
// таймер не встиг, підбирає відновлення (recovery.ts).

import { DISPATCH_CONFIG } from './config'
import { FINAL_WAVE, waveStartsAt } from './core/waves'
import { dispatchJob } from './dispatch'
import type { JobRef } from './types'

type Timer = ReturnType<typeof setTimeout>

interface Watch {
  /** Таймери хвиль уже стоять — повторне планування нічого не додає. */
  planned: boolean
  readonly timers: Set<Timer>
}

const watches = new Map<string, Watch>()

/** Нова чи перевідкрита заявка: хвиля, що настала, — зараз, решта — за розкладом. */
export async function startWaves(job: JobRef): Promise<void> {
  scheduleWaves(job)
  await runWave(job.id)
}

/** Ставить таймери на хвилі заявки, що ще попереду. */
export function scheduleWaves(job: JobRef, now: number = Date.now()): void {
  const watch = watchOf(job.id)
  if (watch.planned) return
  watch.planned = true

  for (let wave = 2; wave <= FINAL_WAVE; wave++) {
    const delay = waveStartsAt(job.createdAt, wave).getTime() - now
    if (delay > 0) after(job.id, delay, () => runWave(job.id))
  }
  release(job.id)
}

/** Знімає хвилі й повтори: заявку закрили, скасували або обрали майстра. */
export function cancelWaves(jobId: string): void {
  const watch = watches.get(jobId)
  if (!watch) return
  for (const timer of watch.timers) clearTimeout(timer)
  watches.delete(jobId)
}

/** Скільки заявок зараз під наглядом планувальника. */
export function scheduledCount(): number {
  return watches.size
}

/**
 * Хвиля зараз. Не кидає: збій повторюється за RETRY_DELAYS_SEC, а коли
 * повтори скінчились — хвилю підбере відновлення.
 */
export async function runWave(jobId: string, attempt = 0): Promise<void> {
  try {
    const result = await dispatchJob(jobId)
    if (result.kind === 'stop') cancelWaves(jobId)
  } catch (err) {
    const delaySec = DISPATCH_CONFIG.RETRY_DELAYS_SEC[attempt]
    if (delaySec === undefined) {
      console.error(
        `[dispatch] job=${jobId} wave failed, left to recovery:`,
        err,
      )
      return
    }
    console.warn(`[dispatch] job=${jobId} wave failed, retry in ${delaySec}s`)
    after(jobId, delaySec * 1000, () => runWave(jobId, attempt + 1))
  }
}

function watchOf(jobId: string): Watch {
  let watch = watches.get(jobId)
  if (!watch) {
    watch = { planned: false, timers: new Set() }
    watches.set(jobId, watch)
  }
  return watch
}

function after(jobId: string, ms: number, run: () => Promise<void>): void {
  const watch = watchOf(jobId)
  const timer = setTimeout(() => {
    watch.timers.delete(timer)
    release(jobId)
    void run()
  }, ms)
  // Незавершений таймер не тримає процес живим при зупинці сервера.
  timer.unref?.()
  watch.timers.add(timer)
}

/** Заявка без жодного таймера більше не під наглядом — Map не росте. */
function release(jobId: string): void {
  if (watches.get(jobId)?.timers.size === 0) watches.delete(jobId)
}
