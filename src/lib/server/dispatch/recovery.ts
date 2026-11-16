// * відновлення розсилки: хвилі, які таймер не встиг, запускаються тут — на
// * старті процесу й страхувальним кроном. Хвиля ідемпотентна

import { DISPATCH_CONFIG } from './config'
import { FINAL_WAVE, ageMinutes, waveAt } from './core/waves'
import { prisma } from './data/db'
import { runWave, scheduleWaves } from './scheduler'
import { queueWaves } from './queue'
import { serverless } from '../runtime'
import type { ResumeReport } from './types'

export async function resumeDispatch(
  now: Date = new Date(),
): Promise<ResumeReport> {
  const jobs = await prisma.job.findMany({
    where: {
      status: 'OPEN',
      expiresAt: { gt: now },
      dispatchWave: { lt: FINAL_WAVE },
      proposalsCount: { lt: DISPATCH_CONFIG.ENOUGH_PROPOSALS },
    },
    select: { id: true, createdAt: true, dispatchWave: true },
    orderBy: { createdAt: 'asc' },
    take: DISPATCH_CONFIG.RESUME_BATCH,
  })

  let caughtUp = 0
  // * по черзі, а не разом: після рестарту заявок може бути багато, а базі
  // * щойно прокинутись
  for (const job of jobs) {
    // * Vercel: таймерів процесу немає — хвилі попереду ставить черга
    // * (повторна постановка тієї самої хвилі відсікається dedupe-ключем)
    if (serverless) await queueWaves(job, now.getTime())
    else scheduleWaves(job, now.getTime())
    if (waveAt(ageMinutes(job.createdAt, now)) > job.dispatchWave) {
      await runWave(job.id)
      caughtUp++
    }
  }

  return { checked: jobs.length, caughtUp }
}
