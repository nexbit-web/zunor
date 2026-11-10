// Журнал дій адмінки (AdminAction). Кожна дія, що щось міняє, пише сюди:
// хто, що, над ким, з якими подробицями й з якої адреси. Записи лише
// додаються — у самій адмінці їх не змінити й не стерти.

import type { RequestEvent } from '@sveltejs/kit'
import { prisma } from '../prisma'
import type { Prisma } from '../../../generated/prisma/client'

export async function logAdmin(
  event: Pick<RequestEvent, 'getClientAddress'>,
  actorId: string,
  action: string,
  target?: { type: string; id: string } | null,
  details?: Prisma.InputJsonValue,
): Promise<void> {
  let ip: string | null = null
  try {
    ip = event.getClientAddress()
  } catch {
    // без адреси — запис однаково потрібен
  }
  await prisma.adminAction.create({
    data: {
      actorId,
      action,
      targetType: target?.type ?? null,
      targetId: target?.id ?? null,
      details: details ?? undefined,
      ip,
    },
  })
}
