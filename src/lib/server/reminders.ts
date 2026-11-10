// Нагадування за день до прибирання — обом сторонам замовлення.
//
// Коли: щодня о 18:00 за Києвом. Таймер у памʼяті процесу (як хвилі
// розсилки, AGENTS 2.1) і задача крона `reminders` як страховка. Це один
// запит до бази на добу: Neon між ними спить (AGENTS 5.1).
//
// Кому: замовлення CREATED — домовились, але ще не почали, — чий день
// роботи завтра. День дає категорія (`matchingFor(...).serviceDay`):
// «завтра» в заявці рахується від дня її СТВОРЕННЯ, а не від сьогодні.
//
// Двічі не шлемо: відмітка — подія замовлення REMINDER_SENT (аудит; з
// «Історії подій» її прибирає order-events.ts), і пишеться вона ДО
// сповіщень. Таймер і крон
// живуть в одному процесі, тож одночасний прогін розводить `running`.

import { prisma } from './prisma'
import { Notify } from './notifications'
import { matchingFor } from '$lib/categories/matching'

import { REMINDER_EVENT } from './order-events'

export { REMINDER_EVENT }

/** Година прогону за Києвом: увечері напередодні, коли людина планує завтра. */
export const REMINDER_HOUR = 18

/** Домовились щойно — нагадування за годину після угоди було б шумом. */
const FRESH_MS = 3 * 60 * 60_000

/** Замовлення старше за це й досі не почате — вже не про «завтра». */
const STALE_MS = 180 * 86_400_000

/** Стеля вибірки за прогін: активних замовлень у рази менше. */
const MAX_ORDERS = 2000

const TZ = 'Europe/Kyiv'
const DAY_MS = 86_400_000

/** Календарний день у Києві («YYYY-MM-DD») для моменту `at` + `plusDays`. */
export function kyivDay(at: Date, plusDays = 0): string {
  return new Date(at.getTime() + plusDays * DAY_MS).toLocaleDateString('sv-SE', {
    timeZone: TZ,
  })
}

/** Зсув Києва від UTC у мс у момент `at` (+2 чи +3 год — літній час). */
function kyivOffsetMs(at: Date): number {
  // 'sv-SE' дає «YYYY-MM-DD HH:MM:SS» — той самий формат, що й ISO.
  const wall = at.toLocaleString('sv-SE', { timeZone: TZ }).replace(' ', 'T')
  return Date.parse(`${wall}Z`) - Math.floor(at.getTime() / 1000) * 1000
}

/** Момент REMINDER_HOUR:00 за Києвом у день `day`. */
function runAt(day: string): number {
  const naive = Date.parse(`${day}T${String(REMINDER_HOUR).padStart(2, '0')}:00:00Z`)
  return naive - kyivOffsetMs(new Date(naive))
}

/** Скільки чекати до найближчого прогону. */
export function msUntilNextRun(now: Date): number {
  let target = runAt(kyivDay(now))
  if (target <= now.getTime()) target = runAt(kyivDay(now, 1))
  return target - now.getTime()
}

/** Сьогоднішній прогін уже мав відбутись (процес піднявся пізніше). */
export function pastTodaysRun(now: Date): boolean {
  return now.getTime() >= runAt(kyivDay(now))
}

let running = false

/**
 * Шле нагадування за всіма замовленнями на завтра. Повертає, скільки
 * замовлень нагадано. Ідемпотентна: повтор того ж дня нічого не шле.
 */
export async function sendDayBeforeReminders(now = new Date()): Promise<number> {
  if (running) return 0
  running = true
  try {
    const tomorrow = kyivDay(now, 1)

    const orders = await prisma.order.findMany({
      where: {
        status: 'CREATED',
        removedAt: null,
        createdAt: {
          lte: new Date(now.getTime() - FRESH_MS),
          gte: new Date(now.getTime() - STALE_MS),
        },
        events: { none: { type: REMINDER_EVENT } },
        // Заблокованій стороні нагадувати нічого, а другій — «завтра
        // прийде» про того, хто вже не прийде, — неправда.
        client: { banned: false },
        master: { banned: false },
      },
      select: {
        id: true,
        title: true,
        metadata: true,
        createdAt: true,
        clientId: true,
        masterId: true,
        client: { select: { name: true } },
        master: { select: { name: true } },
        fromJob: { select: { category: true, createdAt: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_ORDERS,
    })

    // День лежить у metadata (і часто відносно дня заявки), тож у WHERE
    // його не висловити — відбираємо тут.
    const due = orders.filter(
      (o) =>
        matchingFor(o.fromJob?.category ?? '').serviceDay(
          o.metadata,
          o.fromJob?.createdAt ?? o.createdAt,
        ) === tomorrow,
    )

    for (const o of due) {
      // Відмітка ДО сповіщень: краще недонагадати при збої, ніж слати
      // двічі на кожен перезапуск.
      await prisma.orderEvent.create({
        data: { orderId: o.id, type: REMINDER_EVENT, payload: { day: tomorrow } },
      })
      // notify() сам нічого не кидає назовні з Pusher/Telegram, але запис
      // у базу може впасти — одне невдале сповіщення не зупиняє решту.
      await Promise.allSettled([
        Notify.orderReminderClient(o.clientId, o.id, o.title, o.master.name),
        Notify.orderReminderMaster(o.masterId, o.id, o.title, o.client.name),
      ])
    }

    return due.length
  } finally {
    running = false
  }
}

async function runLogged(): Promise<void> {
  try {
    const sent = await sendDayBeforeReminders()
    if (sent > 0) console.log(`[reminders] sent for ${sent} order(s)`)
  } catch (err) {
    console.error('[reminders] run failed:', err)
  }
}

const STARTED = Symbol.for('zunor.reminders.started')

/**
 * Запуск щоденного таймера — з `init` у hooks.server.ts. Повторний виклик
 * (HMR у dev) другого таймера не заводить.
 */
export function startReminders(): void {
  const g = globalThis as Record<symbol, unknown>
  if (g[STARTED]) return
  g[STARTED] = true

  // Процес піднявся після 18:00 — сьогоднішній прогін міг пропасти.
  // Відмітки не дадуть надіслати вдруге те, що вже пішло.
  if (pastTodaysRun(new Date())) void runLogged()

  const schedule = () => {
    const timer = setTimeout(() => {
      void runLogged().finally(schedule)
    }, msUntilNextRun(new Date()))
    // Таймер не тримає процес живим сам по собі.
    timer.unref?.()
  }
  schedule()
}
