// src/lib/server/order-state-machine.ts

import type { OrderStatus } from '../../generated/prisma/client'

/**
 * Order state machine — централизованная логика переходов между статусами.
 *
 * Новая Uber-модель:
 *   CREATED ──(START, master)──> IN_PROGRESS ──(COMPLETE, master)──> COMPLETED
 *      │                              │
 *      └──(CANCEL, обе стороны)──> CANCELLED <─(CANCEL, обе стороны)─┘
 *
 * Терминальные состояния (COMPLETED, CANCELLED) не имеют выходов.
 */

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
  // CANCEL — спецкейс, разрешён из CREATED и IN_PROGRESS
  CANCEL: {
    from: 'CREATED', // проверяется отдельно
    to: 'CANCELLED',
    allowedActors: ['CLIENT', 'MASTER'],
  },
}

/**
 * Проверяет, разрешён ли конкретный переход.
 *
 * @returns null если разрешено, или строка с причиной ошибки
 */
export function canTransition(
  currentStatus: OrderStatus,
  transition: OrderTransition,
  actor: Actor,
): string | null {
  // CANCEL — разрешён из CREATED и IN_PROGRESS
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

/**
 * Возвращает целевой статус для разрешённого перехода.
 */
export function nextStatus(transition: OrderTransition): OrderStatus {
  return TRANSITIONS[transition].to
}

/**
 * Определяет роль юзера в заказе.
 */
export function getActor(
  userId: string,
  order: { clientId: string; masterId: string },
): Actor | null {
  if (userId === order.clientId) return 'CLIENT'
  if (userId === order.masterId) return 'MASTER'
  return null
}

/**
 * Является ли статус терминальным.
 */
export function isTerminal(status: OrderStatus): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED'
}
