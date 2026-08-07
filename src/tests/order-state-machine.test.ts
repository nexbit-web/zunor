import { describe, it, expect } from 'vitest'
import {
  canTransition,
  nextStatus,
  getActor,
  isTerminal,
} from '$lib/server/order-state-machine'

// Стейт-машина — єдине місце, де вирішується, ХТО і КОЛИ може рухати
// замовлення. Тести фіксують саме права, а не механіку переходів:
// помилка тут означає, що клієнт закриває роботу за майстра.

describe('canTransition: START', () => {
  it('дозволений майстру з CREATED', () => {
    expect(canTransition('CREATED', 'START', 'MASTER')).toBeNull()
  })

  it('заборонений клієнту — роботу починає виконавець', () => {
    expect(canTransition('CREATED', 'START', 'CLIENT')).not.toBeNull()
  })

  it('заборонений із IN_PROGRESS — повторний старт неможливий', () => {
    expect(canTransition('IN_PROGRESS', 'START', 'MASTER')).not.toBeNull()
  })
})

describe('canTransition: COMPLETE', () => {
  it('дозволений майстру з IN_PROGRESS', () => {
    expect(canTransition('IN_PROGRESS', 'COMPLETE', 'MASTER')).toBeNull()
  })

  it('заборонений з CREATED — не можна завершити нерозпочате', () => {
    expect(canTransition('CREATED', 'COMPLETE', 'MASTER')).not.toBeNull()
  })

  it('заборонений клієнту', () => {
    expect(canTransition('IN_PROGRESS', 'COMPLETE', 'CLIENT')).not.toBeNull()
  })
})

describe('canTransition: CANCEL', () => {
  it('дозволений обом сторонам із CREATED', () => {
    expect(canTransition('CREATED', 'CANCEL', 'CLIENT')).toBeNull()
    expect(canTransition('CREATED', 'CANCEL', 'MASTER')).toBeNull()
  })

  it('дозволений обом сторонам із IN_PROGRESS', () => {
    expect(canTransition('IN_PROGRESS', 'CANCEL', 'CLIENT')).toBeNull()
    expect(canTransition('IN_PROGRESS', 'CANCEL', 'MASTER')).toBeNull()
  })

  it('SYSTEM не скасовує замовлення — тільки люди', () => {
    expect(canTransition('CREATED', 'CANCEL', 'SYSTEM')).not.toBeNull()
  })
})

describe('термінальні стани не мають виходів', () => {
  const actors = ['CLIENT', 'MASTER', 'SYSTEM'] as const
  const transitions = ['START', 'COMPLETE', 'CANCEL'] as const

  for (const status of ['COMPLETED', 'CANCELLED'] as const) {
    for (const t of transitions) {
      for (const actor of actors) {
        it(`${status} + ${t} (${actor}) → заборонено`, () => {
          expect(canTransition(status, t, actor)).not.toBeNull()
        })
      }
    }
  }
})

describe('nextStatus', () => {
  it('веде у цільовий стан переходу', () => {
    expect(nextStatus('START')).toBe('IN_PROGRESS')
    expect(nextStatus('COMPLETE')).toBe('COMPLETED')
    expect(nextStatus('CANCEL')).toBe('CANCELLED')
  })
})

describe('getActor', () => {
  const order = { clientId: 'c1', masterId: 'm1' }

  it('розрізняє клієнта і майстра', () => {
    expect(getActor('c1', order)).toBe('CLIENT')
    expect(getActor('m1', order)).toBe('MASTER')
  })

  it('стороння людина не є учасником', () => {
    expect(getActor('stranger', order)).toBeNull()
  })
})

describe('isTerminal', () => {
  it('термінальні — лише COMPLETED і CANCELLED', () => {
    expect(isTerminal('COMPLETED')).toBe(true)
    expect(isTerminal('CANCELLED')).toBe(true)
    expect(isTerminal('CREATED')).toBe(false)
    expect(isTerminal('IN_PROGRESS')).toBe(false)
  })
})
