import type { OrderStatus } from '../../generated/prisma/client'

// * переходи статусів замовлення — лише тут:
// *   CREATED ──(START, майстер)──> IN_PROGRESS ──(COMPLETE, майстер)──> COMPLETED
// *   CANCEL — обидві сторони, з CREATED і з IN_PROGRESS
// * COMPLETED і CANCELLED — кінцеві

export type Actor = 'CLIENT' | 'MASTER' | 'SYSTEM'

export type OrderTransition = 'START' | 'COMPLETE' | 'CANCEL'

interface TransitionRule {
  from: OrderStatus
  to: OrderStatus
  allowedActors: Actor[]
}

const TRANSITIONS: Record<OrderTransition, TransitionRule> = {
  START: {
    from: 'CREATED',
    to: 'IN_PROGRESS',
    allowedActors: ['MASTER'],
  },
  COMPLETE: {
    from: 'IN_PROGRESS',
    to: 'COMPLETED',
    allowedActors: ['MASTER'],
  },
  // * дозволений із CREATED і з IN_PROGRESS — перевіряється окремо
  CANCEL: {
    from: 'CREATED', // проверяется отдельно
    to: 'CANCELLED',
    allowedActors: ['CLIENT', 'MASTER'],
  },
}

/** null — перехід дозволено; інакше причина відмови. */
export function canTransition(
  currentStatus: OrderStatus,
  transition: OrderTransition,
  actor: Actor,
): string | null {
  if (transition === 'CANCEL') {
    const cancellableStates: OrderStatus[] = ['CREATED', 'IN_PROGRESS']
    if (!cancellableStates.includes(currentStatus)) {
      return `Не можна скасувати замовлення зі стану ${currentStatus}`
    }
    if (!TRANSITIONS.CANCEL.allowedActors.includes(actor)) {
      return 'Тільки клієнт або майстер може скасувати'
    }
    return null
  }

  const rule = TRANSITIONS[transition]
  if (!rule) return 'Невідомий перехід'

  if (rule.from !== currentStatus) {
    return `Перехід "${transition}" дозволений тільки зі стану ${rule.from}, а зараз ${currentStatus}`
  }

  if (!rule.allowedActors.includes(actor)) {
    return `Цей перехід може зробити тільки: ${rule.allowedActors.join(', ')}`
  }

  return null
}

export function nextStatus(transition: OrderTransition): OrderStatus {
  return TRANSITIONS[transition].to
}

/** Роль користувача в замовленні. */
export function getActor(
  userId: string,
  order: { clientId: string; masterId: string },
): Actor | null {
  if (userId === order.clientId) return 'CLIENT'
  if (userId === order.masterId) return 'MASTER'
  return null
}

export function isTerminal(status: OrderStatus): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED'
}
