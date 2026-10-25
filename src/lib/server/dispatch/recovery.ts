// Відновлення розсилки: хвилі, які таймер не встиг (рестарт процесу, збій
// бази, вичерпані повтори), запускаються тут. Кличеться на старті процесу
// (hooks.server.ts) і страхувальним кроном. Кликати можна будь-коли:
// хвиля ідемпотентна.

import { DISPATCH_CONFIG } from './config'
import { FINAL_WAVE, ageMinutes, waveAt } from './core/waves'
import { prisma } from './data/db'
import { runWave, scheduleWaves } from './scheduler'
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
  // По черзі, а не разом: після рестарту заявок може бути багато, а базі
  // щойно прокинутись.
  for (const job of jobs) {
    scheduleWaves(job, now.getTime())
    if (waveAt(ageMinutes(job.createdAt, now)) > job.dispatchWave) {
      await runWave(job.id)
      caughtUp++
    }
  }

  return { checked: jobs.length, caughtUp }
}
