// Дії адмінки. Кожна:
//   — перевіряє права виконавця ще раз (гард сторінки — не єдиний замок);
//   — міняє дані ЧЕРЕЗ правила застосунку, а не мимо них: бан відкликає
//     сесії й у Redis, і в базі, скидає кеш стану, знімає хвилі розсилки;
//     рішення модерації приходить майстрові сповіщенням (і в Telegram);
//   — пише запис у журнал (AdminAction).
//
// Саме цього бракувало окремій CRM: вона писала в базу напряму, і бан
// діяв із запізненням, а майстер не дізнавався про рішення модерації.

import { error, type RequestEvent } from '@sveltejs/kit'
import { prisma } from '../prisma'
import { Notify } from '../notifications'
import { revokeSessions } from '../sessions'
import { invalidateAccount } from '../account-cache'
import { forgetChatId } from '../telegram/chat-cache'
import {
  afterOpenWorkClosed,
  closeOpenWork,
  openWorkOf,
} from '../account-deletion'
import { atLeast, isStaff, type StaffRole } from '$lib/admin/roles'
import { logAdmin } from './audit'
import type { Staff } from './guard'

type Ev = Pick<RequestEvent, 'getClientAddress'>

const DELETED_BAN_REASON = 'account-deleted'

// ─── Модерація анкет ───

export async function decideVerification(
  event: Ev,
  staff: Staff,
  masterId: string,
  decision: 'approve' | 'reject',
  reason?: string,
): Promise<void> {
  const profile = await prisma.masterProfile.findUnique({
    where: { userId: masterId },
    select: { verificationStatus: true },
  })
  if (!profile) error(404, 'Анкету не знайдено')

  if (decision === 'reject' && (!reason || reason.trim().length < 5)) {
    error(400, 'Вкажіть причину відмови (щонайменше 5 символів)')
  }

  const now = new Date()
  await prisma.masterProfile.update({
    where: { userId: masterId },
    data:
      decision === 'approve'
        ? {
            verificationStatus: 'VERIFIED',
            verifiedAt: now,
            verificationRejectReason: null,
          }
        : {
            verificationStatus: 'REJECTED',
            verifiedAt: null,
            verificationRejectReason: reason!.trim(),
          },
  })

  await logAdmin(
    event,
    staff.id,
    decision === 'approve' ? 'verify.approve' : 'verify.reject',
    { type: 'user', id: masterId },
    decision === 'reject' ? { reason: reason!.trim() } : undefined,
  )

  // Після запису: сповіщення про рішення, якого в базі немає, гірше за
  // запізніле.
  if (decision === 'approve') await Notify.verificationApproved(masterId)
  else await Notify.verificationRejected(masterId, reason!.trim())
}

// ─── Бан ───

/** Хто кого може банити. Співробітника — лише ADMIN; останнього ADMIN — ніхто. */
async function assertCanModerateUser(
  staff: Staff,
  targetId: string,
): Promise<{ role: string; banReason: string | null; banned: boolean }> {
  if (targetId === staff.id) error(400, 'Не можна застосувати до себе')

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { role: true, banned: true, banReason: true },
  })
  if (!target) error(404, 'Користувача не знайдено')

  if (isStaff(target.role)) {
    if (staff.role !== 'ADMIN') error(403, 'Співробітників банить лише адміністратор')
    if (target.role === 'ADMIN' && (await activeAdminCount()) <= 1) {
      error(400, 'Це останній адміністратор')
    }
  } else if (!atLeast(staff.role, 'MANAGER')) {
    error(403, 'Недостатньо прав')
  }
  return target
}

async function activeAdminCount(): Promise<number> {
  return prisma.user.count({ where: { role: 'ADMIN', banned: false } })
}

export async function banUser(
  event: Ev,
  staff: Staff,
  targetId: string,
  reason: string,
): Promise<void> {
  const text = reason.trim()
  if (text.length < 5) error(400, 'Вкажіть причину (щонайменше 5 символів)')

  const target = await assertCanModerateUser(staff, targetId)
  if (target.banned) error(400, 'Уже заблоковано')

  // Відкрита робота забаненого не має висіти: його заявки більше нікому
  // не потрібні, а його пропозиції клієнт не повинен обирати.
  const work = await openWorkOf(targetId)
  const now = new Date()
  await prisma.$transaction(async (tx) => {
    await closeOpenWork(tx, work, now)
    await tx.user.update({
      where: { id: targetId },
      data: { banned: true, banReason: text, isOnline: false },
    })
    // Push на телефони — геть разом із сесіями: після розбану пристрій
    // без сесії не мав би отримувати сповіщення цього акаунта.
    await tx.pushToken.deleteMany({ where: { userId: targetId } })
  })
  afterOpenWorkClosed(work)

  // Бан має подіяти на першому ж запиті: сесії — і з Redis, і з бази
  // (через better-auth цього процесу), стан акаунта — без кешу.
  await revokeSessions(targetId).catch((err) =>
    console.error('[admin] revoke sessions failed:', err),
  )
  await invalidateAccount(targetId)
  forgetChatId(targetId)

  await logAdmin(event, staff.id, 'user.ban', { type: 'user', id: targetId }, {
    reason: text,
    closedJobs: work.openJobIds.length,
    withdrawnProposals: work.pending.length,
  })
}

export async function unbanUser(
  event: Ev,
  staff: Staff,
  targetId: string,
): Promise<void> {
  const target = await assertCanModerateUser(staff, targetId)
  if (!target.banned) error(400, 'Не заблоковано')
  // Видалений акаунт теж banned — але його вже знеособлено, повертати нічого.
  if (target.banReason === DELETED_BAN_REASON) {
    error(400, 'Акаунт видалено власником — розблокувати не можна')
  }

  await prisma.user.update({
    where: { id: targetId },
    data: { banned: false, banReason: null, banExpires: null },
  })
  await invalidateAccount(targetId)
  await logAdmin(event, staff.id, 'user.unban', { type: 'user', id: targetId })
}

// ─── Скарги ───

export async function resolveReport(
  event: Ev,
  staff: Staff,
  reportId: string,
  status: 'RESOLVED' | 'DISMISSED',
  resolution: string,
): Promise<void> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { status: true, reporterId: true, targetId: true },
  })
  if (!report) error(404, 'Скаргу не знайдено')
  if (report.status !== 'OPEN') error(400, 'Скаргу вже розглянуто')

  await prisma.report.update({
    where: { id: reportId },
    data: {
      status,
      resolution: resolution.trim() || null,
      resolvedAt: new Date(),
      resolvedById: staff.id,
    },
  })

  await logAdmin(
    event,
    staff.id,
    status === 'RESOLVED' ? 'report.resolve' : 'report.dismiss',
    { type: 'report', id: reportId },
    { targetId: report.targetId, resolution: resolution.trim() || null },
  )

  // Людині, що поскаржилась, — що її почули. Відхилену не сповіщаємо:
  // «ми нічого не зробили» без пояснення лише дратує.
  if (status === 'RESOLVED') await Notify.reportResolved(report.reporterId)
}

// ─── Співробітники (лише ADMIN) ───

/**
 * Призначає роль співробітника людині з акаунтом у Zunor (за поштою) або
 * знімає її (role = null → CLIENT). Свою роль змінити не можна; останнього
 * ADMIN — понизити теж.
 */
export async function setStaffRole(
  event: Ev,
  staff: Staff,
  email: string,
  role: StaffRole | null,
): Promise<void> {
  if (staff.role !== 'ADMIN') error(403, 'Недостатньо прав')

  const target = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, role: true, banned: true },
  })
  if (!target) error(404, 'Акаунта з такою поштою немає — нехай спершу зареєструється')
  if (target.id === staff.id) error(400, 'Свою роль змінити не можна')
  if (target.banned) error(400, 'Акаунт заблоковано')
  if (role === null && !isStaff(target.role)) error(400, 'Це не співробітник')
  if (role !== null && target.role === 'MASTER') {
    // Майстер-співробітник модерував би сам себе й конкурентів.
    error(400, 'Майстер не може бути співробітником — потрібен окремий акаунт')
  }
  if (
    target.role === 'ADMIN' &&
    role !== 'ADMIN' &&
    (await activeAdminCount()) <= 1
  ) {
    error(400, 'Це останній адміністратор')
  }

  const next = role ?? 'CLIENT'
  await prisma.user.update({ where: { id: target.id }, data: { role: next } })
  // Знята роль діє на першому ж запиті: гард читає роль із кешу стану.
  await invalidateAccount(target.id)

  await logAdmin(event, staff.id, 'staff.role', { type: 'user', id: target.id }, {
    from: target.role,
    to: next,
  })
}

/** Співробітник загубив телефон: скинути другий фактор — при вході налаштує знову. */
export async function resetStaffTwoFactor(
  event: Ev,
  staff: Staff,
  targetId: string,
): Promise<void> {
  if (staff.role !== 'ADMIN') error(403, 'Недостатньо прав')
  if (targetId === staff.id) error(400, 'Свій другий фактор скидає інший адміністратор')

  await prisma.staffTwoFactor.deleteMany({ where: { userId: targetId } })
  // Живі сесії з уже введеним кодом теж закриваємо — інакше скидання
  // нічого б не змінило до кінця робочого дня.
  await revokeSessions(targetId).catch(() => {})
  await logAdmin(event, staff.id, 'staff.reset_2fa', { type: 'user', id: targetId })
}
