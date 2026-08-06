// Планувальник хвиль у пам'яті процесу.
//
// Чому не крон щохвилини: Neon тарифікує ЧАС РОБОТИ вичислювача, а не
// запити. Тік раз на хвилину не давав базі заснути ніколи й випалював
// місячну квоту за тиждень при нульовому трафіку. Таймери в процесі будять
// базу лише коли є справжня робота.
//
// Працює саме тому, що процес один і довгоживучий (adapter-node). Втрачені
// при рестарті таймери підбирає рідкісний страхувальний крон (/api/cron).

import { DISPATCH_CONFIG } from './types'
import { dispatchJob } from './index'

interface Scheduled {
  handles: ReturnType<typeof setTimeout>[]
  /** Скільки хвиль ще не відпрацювало. Дійде до нуля — запис прибираємо. */
  pending: number
}

const timers = new Map<string, Scheduled>()

/**
 * Планує хвилі 2..N для щойно створеної заявки.
 * Хвилю 1 запускає POST /api/jobs синхронно — вона має піти негайно.
 *
 * Номер хвилі НЕ передається в таймер: `decide()` рахує його з віку
 * заявки, тож планувальнику достатньо розбудити диспетчер вчасно.
 */
export function scheduleWaves(jobId: string, jobTitle: string): void {
  if (timers.has(jobId)) return

  const delayed = DISPATCH_CONFIG.WAVES.filter((w) => w.afterMinutes > 0)
  if (delayed.length === 0) return

  const entry: Scheduled = { handles: [], pending: delayed.length }

  for (const wave of delayed) {
    const handle = setTimeout(() => {
      void runWave(jobId, jobTitle)
    }, wave.afterMinutes * 60_000)

    // unref: незавершений таймер не має тримати процес живим при зупинці
    // сервера. Поки процес працює — таймер спрацює як звичайно.
    handle.unref?.()
    entry.handles.push(handle)
  }

  timers.set(jobId, entry)
}

/**
 * Скасовує заплановані хвилі: заявку закрили, скасували або на неї вже
 * обрали майстра. Без цього таймер розбудив би базу заради заявки, для
 * якої `decide()` однаково поверне 'job-closed'.
 */
export function cancelWaves(jobId: string): void {
  const entry = timers.get(jobId)
  if (!entry) return

  for (const h of entry.handles) clearTimeout(h)
  timers.delete(jobId)
}

/** Скільки заявок зараз під наглядом планувальника (для діагностики). */
export function scheduledCount(): number {
  return timers.size
}

async function runWave(jobId: string, jobTitle: string): Promise<void> {
  const entry = timers.get(jobId)
  if (entry) entry.pending--

  try {
    const res = await dispatchJob(jobId, jobTitle)

    // Заявка закрита або відгуків уже досить — решту хвиль знімаємо, щоб
    // таймери не будили базу даремно. 'no-candidates' не рахуємо: майстри
    // можуть зареєструватися до наступної хвилі.
    if (res.stopped === 'job-closed' || res.stopped === 'enough-proposals') {
      cancelWaves(jobId)
      return
    }
  } catch (err) {
    console.error(`[dispatch:scheduler] job=${jobId} wave failed:`, err)
  }

  // Остання хвиля відпрацювала — заявці більше нічого не заплановано.
  const current = timers.get(jobId)
  if (current && current.pending <= 0) timers.delete(jobId)
}
