// * правила показу тостів — окремо, щоб стор не знав про UI-бібліотеку: тип
// * сповіщення → вигляд картки й куди веде кнопка

import toast, { useToasterState } from 'svelte-hot-french-toast'
import type { Component } from 'svelte'
import Island, { type IslandProps, type IslandTone } from './island.svelte'
import { linkFor, type Notification } from './types'
import { KIND_TEXT, FALLBACK_TEXT, type KindText } from './kinds'
import ClipboardIcon from '$lib/components/icons/set/clipboard-list.svelte'
import MessageIcon from '$lib/components/icons/set/message-square-text.svelte'
import HandshakeIcon from '$lib/components/icons/set/handshake.svelte'
import TimerIcon from '$lib/components/icons/set/timer.svelte'
import CircleCheckIcon from '$lib/components/icons/set/circle-check.svelte'
import CalendarXIcon from '$lib/components/icons/set/calendar-x.svelte'
import CalendarClockIcon from '$lib/components/icons/set/calendar-clock.svelte'
import PencilIcon from '$lib/components/icons/set/pencil.svelte'
import UserSearchIcon from '$lib/components/icons/set/user-round-search.svelte'
import BellIcon from '$lib/components/icons/set/bell.svelte'
import BadgeCheckIcon from '$lib/components/icons/set/badge-check.svelte'
import CircleAlertIcon from '$lib/components/icons/set/circle-alert.svelte'
import FlagIcon from '$lib/components/icons/set/flag.svelte'
import WalletIcon from '$lib/components/icons/set/wallet.svelte'

/** Довше за звичайний тост: тут є що прочитати й на що натиснути. */
const DURATION = 10_000

/** Карток на екрані одночасно — не більше. */
const MAX_VISIBLE = 3

/** Висота найвищої картки разом із проміжком між картками: з неї
 *  рахуємо, скільки їх влазить у висоту вікна. */
const CARD_SPACE = 200

const ID_PREFIX = 'notification-'

interface IslandKind extends KindText {
  icon: Component<{ class?: string }>
  tone: IslandTone
}

// * слова (ярлик і напис дії) — з kinds.ts, спільні з Telegram; тут лише
// * те, що належить самій картці: іконка й тон
const KINDS: Record<string, IslandKind> = {
  NEW_JOB: { ...KIND_TEXT.NEW_JOB, icon: ClipboardIcon, tone: 'accent' },
  NEW_PROPOSAL: { ...KIND_TEXT.NEW_PROPOSAL, icon: MessageIcon, tone: 'accent' },
  PROPOSAL_UPDATED: {
    ...KIND_TEXT.PROPOSAL_UPDATED,
    icon: WalletIcon,
    tone: 'accent',
  },
  PROPOSAL_ACCEPTED: {
    ...KIND_TEXT.PROPOSAL_ACCEPTED,
    icon: HandshakeIcon,
    tone: 'success',
  },
  ORDER_STARTED: { ...KIND_TEXT.ORDER_STARTED, icon: TimerIcon, tone: 'accent' },
  ORDER_COMPLETED: {
    ...KIND_TEXT.ORDER_COMPLETED,
    icon: CircleCheckIcon,
    tone: 'success',
  },
  ORDER_CANCELLED: {
    ...KIND_TEXT.ORDER_CANCELLED,
    icon: CalendarXIcon,
    tone: 'danger',
  },
  ORDER_REMINDER: {
    ...KIND_TEXT.ORDER_REMINDER,
    icon: CalendarClockIcon,
    tone: 'accent',
  },
  JOB_REOPENED: {
    ...KIND_TEXT.JOB_REOPENED,
    icon: UserSearchIcon,
    tone: 'warning',
  },
  JOB_UPDATED: { ...KIND_TEXT.JOB_UPDATED, icon: PencilIcon, tone: 'warning' },
  VERIFICATION_APPROVED: {
    ...KIND_TEXT.VERIFICATION_APPROVED,
    icon: BadgeCheckIcon,
    tone: 'success',
  },
  VERIFICATION_REJECTED: {
    ...KIND_TEXT.VERIFICATION_REJECTED,
    icon: CircleAlertIcon,
    tone: 'warning',
  },
  REPORT_RESOLVED: {
    ...KIND_TEXT.REPORT_RESOLVED,
    icon: FlagIcon,
    tone: 'accent',
  },
}

const FALLBACK: IslandKind = { ...FALLBACK_TEXT, icon: BellIcon, tone: 'accent' }

/**
 * Звільняє місце під нову картку: на екрані не більше MAX_VISIBLE і не
 * більше, ніж влазить у висоту вікна; найстаріші закриваються. Саме
 * сповіщення лишається в стрічці.
 */
function makeRoom(id: string): void {
  const fit = Math.floor((window.innerHeight - 32) / CARD_SPACE)
  const limit = Math.min(MAX_VISIBLE, Math.max(1, fit))

  const shown = useToasterState().toasts.filter(
    (t) => t.visible && t.id !== id && t.id.startsWith(ID_PREFIX),
  )
  for (const t of shown.slice(limit - 1)) toast.dismiss(t.id)
}

/**
 * onOpen — людина перейшла за сповіщенням. Стор позначає його
 * прочитаним; колбеком, а не імпортом стора, — інакше модулі імпортували
 * б один одного по колу.
 */
export function showNotificationToast(
  n: Notification,
  onOpen?: () => void,
): void {
  const kind = KINDS[n.type] ?? FALLBACK
  // * id сповіщення: та сама подія, що прийшла двічі (перепідключення
  // * Pusher), не дасть двох карток
  const id = `${ID_PREFIX}${n.id}`

  // * повтор, поки картка на екрані, пропускаємо: бібліотека не дала б
  // * оживленій картці нового таймера закриття
  if (useToasterState().toasts.some((t) => t.id === id)) return

  makeRoom(id)

  toast.custom<IslandProps>(Island, {
    id,
    duration: DURATION,
    // * правий верхній кут, як сповіщення macOS: посередині картка
    // * закривала б заголовок сторінки. На телефоні вона майже на всю
    // * ширину, тож той самий кут там — це просто «вгорі»
    position: 'top-end',
    props: {
      label: kind.label,
      title: n.title,
      body: n.body,
      action: kind.action,
      href: linkFor(n),
      icon: kind.icon,
      tone: kind.tone,
      duration: DURATION,
      onopen: onOpen,
    },
  })
}
