// ЄДИНЕ правило: хто має право бачити заявку цілком (разом із фото
// помешкання клієнта). Сторінка й `GET /api/jobs/[id]` віддають ті самі дані,
// тож умова мусить бути одна: доки вона жила лише на сторінці, ендпоінт
// обходився звичайним fetch. Додаєш новий шлях до заявки — клич цю функцію.
//
// prisma імпортується ЛІНИВО, всередині функції: інакше модуль тягне за собою
// `$env` і правило доступу неможливо покрити юніт-тестами.

export interface JobAccessSubject {
  id: string
  clientId: string
  status: string
  city: string
  category: string
}

export interface JobAccessViewer {
  id: string
  role: string
  city: string | null
  masterProfile: {
    isActive: boolean
    categories: string[]
  } | null
}

export interface JobAccess {
  canView: boolean
  isOwner: boolean
  isMaster: boolean
}

/**
 * Чиста частина правила: чи підходить заявка майстрові так само, як у
 * стрічці. Винесена окремо, щоб її можна було покрити тестами без БД —
 * решта функції ходить у базу за пропозицією.
 */
export function isEligibleFromFeed(
  job: JobAccessSubject,
  viewer: JobAccessViewer,
): boolean {
  if (viewer.role !== 'MASTER') return false
  const mp = viewer.masterProfile
  return (
    !!mp?.isActive &&
    job.status === 'OPEN' &&
    viewer.city === job.city &&
    mp.categories.includes(job.category)
  )
}

/**
 * Заявку бачить:
 *   • власник — завжди;
 *   • активний майстер, якому вона підходить так само, як у стрічці
 *     (відкрита, його місто, його категорія);
 *   • майстер, який уже подавав на неї пропозицію (стрічка могла змінитись,
 *     але свою історію він має бачити).
 *
 * Решта не бачить нічого. На виклику це має бути **404, а не 403**: 403
 * підтверджує, що заявка з таким id існує, і дозволяє перебором зібрати
 * карту бази. 404 не каже нічого.
 */
export async function checkJobAccess(
  job: JobAccessSubject,
  viewer: JobAccessViewer,
): Promise<JobAccess> {
  const isOwner = job.clientId === viewer.id
  const isMaster = viewer.role === 'MASTER'

  if (isOwner) return { canView: true, isOwner, isMaster }
  if (!isMaster) return { canView: false, isOwner, isMaster }

  if (isEligibleFromFeed(job, viewer)) {
    return { canView: true, isOwner, isMaster }
  }

  // Остання підстава — власна пропозиція. Запит робимо лише тут, щоб не
  // ходити в базу для тих, кого пустила перевірка вище.
  const { prisma } = await import('./prisma')
  const ownProposal = await prisma.proposal.findFirst({
    where: { jobId: job.id, masterId: viewer.id },
    select: { id: true },
  })

  return { canView: !!ownProposal, isOwner, isMaster }
}

/** Поля глядача, потрібні `checkJobAccess`. Один select на обидва виклики. */
export const jobViewerSelect = {
  role: true,
  city: true,
  masterProfile: {
    select: {
      isActive: true,
      categories: true,
    },
  },
} as const
