import { describe, it, expect } from 'vitest'
import {
  isEligibleFromFeed,
  type JobAccessSubject,
  type JobAccessViewer,
} from '$lib/server/job-access'

// Заявка-еталон: відкрита, Одеса, прибирання.
const job: JobAccessSubject = {
  id: 'job-1',
  clientId: 'client-1',
  status: 'OPEN',
  city: 'odesa',
  category: 'cleaning',
}

/** Активний майстер, який працює саме з такими заявками. */
function master(patch: Partial<JobAccessViewer> = {}): JobAccessViewer {
  return {
    id: 'master-1',
    role: 'MASTER',
    city: 'odesa',
    masterProfile: { isActive: true, categories: ['cleaning'] },
    ...patch,
  }
}

describe('isEligibleFromFeed', () => {
  it('пускає майстра, якому заявка підходить так само, як у стрічці', () => {
    expect(isEligibleFromFeed(job, master())).toBe(true)
  })

  // Головне, заради чого правило існує: фото помешкання клієнта не має
  // бути видно нікому, крім тих, хто справді може взяти цю роботу.
  it('не пускає клієнта — навіть із того ж міста', () => {
    const client = master({ role: 'CLIENT' })
    expect(isEligibleFromFeed(job, client)).toBe(false)
  })

  it('не пускає майстра з іншого міста', () => {
    expect(isEligibleFromFeed(job, master({ city: 'kyiv' }))).toBe(false)
  })

  it('не пускає майстра з іншою категорією', () => {
    const other = master({
      masterProfile: { isActive: true, categories: ['repair'] },
    })
    expect(isEligibleFromFeed(job, other)).toBe(false)
  })

  it('не пускає майстра з вимкненим профілем', () => {
    const off = master({
      masterProfile: { isActive: false, categories: ['cleaning'] },
    })
    expect(isEligibleFromFeed(job, off)).toBe(false)
  })

  it('не пускає майстра без профілю зовсім', () => {
    expect(isEligibleFromFeed(job, master({ masterProfile: null }))).toBe(false)
  })

  it('не пускає майстра без міста в профілі', () => {
    expect(isEligibleFromFeed(job, master({ city: null }))).toBe(false)
  })

  // Закрита заявка зникає зі стрічки — разом із доступом до вкладень.
  // Хто вже подавався, потрапляє сюди іншим шляхом (власна пропозиція).
  it.each(['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED'])(
    'не пускає у стрічковий доступ до заявки зі статусом %s',
    (status) => {
      expect(isEligibleFromFeed({ ...job, status }, master())).toBe(false)
    },
  )
})
