// * єдине правило, хто бачить заявку цілком (із фото помешкання): для сторінки
// * й для GET /api/jobs/[id]. prisma імпортується ліниво — правило тестується без бази

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

/** Чиста частина правила: заявка підходить майстрові так само, як у стрічці. */
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

// * заявку бачить власник, майстер, якому вона підходить як у стрічці, і
// * майстер із власною пропозицією. Решті — 404, а не 403: 403 підтверджує,
// * що заявка існує
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

  // * остання підстава — власна пропозиція; у базу йдемо лише тут
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
