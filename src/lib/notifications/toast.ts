// Правила показу тостів. Винесено окремо, щоб store не знав нічого
// про UI-бібліотеку: захочете змінити тости — правите лише цей файл.
//
// Сповіщення показуються карткою з дією (island.svelte). Тут — лише
// відповідність типу сповіщення до того, як картка виглядає й куди веде
// кнопка, і де вона зʼявляється.

import toast, { useToasterState } from 'svelte-hot-french-toast'
import type { Component } from 'svelte'
import Island, { type IslandProps, type IslandTone } from './island.svelte'
import { linkFor, type Notification } from './types'
import ClipboardIcon from '$lib/components/icons/set/clipboard-list.svelte'
import MessageIcon from '$lib/components/icons/set/message-square-text.svelte'
import HandshakeIcon from '$lib/components/icons/set/handshake.svelte'
import TimerIcon from '$lib/components/icons/set/timer.svelte'
import CircleCheckIcon from '$lib/components/icons/set/circle-check.svelte'
import CalendarXIcon from '$lib/components/icons/set/calendar-x.svelte'
import UserSearchIcon from '$lib/components/icons/set/user-round-search.svelte'
import BellIcon from '$lib/components/icons/set/bell.svelte'

/** Довше за звичайний тост: тут є що прочитати й на що натиснути. */
const DURATION = 10_000

/** Карток на екрані одночасно — не більше. */
const MAX_VISIBLE = 3

/** Висота найвищої картки разом із проміжком між картками: з неї
 *  рахуємо, скільки їх влазить у висоту вікна. */
const CARD_SPACE = 200

const ID_PREFIX = 'notification-'

interface IslandKind {
  /** Одне-два слова над заголовком картки. */
  label: string
  /** Напис на кнопці — що саме станеться, а не «Відкрити». */
  action: string
  icon: Component<{ class?: string }>
  tone: IslandTone
}

const KINDS: Record<string, IslandKind> = {
  NEW_JOB: {
    label: 'Нова заявка',
    action: 'Переглянути заявку',
    icon: ClipboardIcon,
    tone: 'accent',
  },
  NEW_PROPOSAL: {
    label: 'Новий відгук',
    action: 'Переглянути відгук',
    icon: MessageIcon,
    tone: 'accent',
  },
  PROPOSAL_ACCEPTED: {
    label: 'Вас обрали',
    action: 'Відкрити замовлення',
    icon: HandshakeIcon,
    tone: 'success',
  },
  ORDER_STARTED: {
    label: 'Робота почалась',
    action: 'Відкрити замовлення',
    icon: TimerIcon,
    tone: 'accent',
  },
  ORDER_COMPLETED: {
    label: 'Роботу завершено',
    action: 'Залишити відгук',
    icon: CircleCheckIcon,
    tone: 'success',
  },
  ORDER_CANCELLED: {
    label: 'Скасовано',
    action: 'Деталі замовлення',
    icon: CalendarXIcon,
    tone: 'danger',
  },
  JOB_REOPENED: {
    label: 'Шукаємо нового',
    action: 'До заявки',
    icon: UserSearchIcon,
    tone: 'warning',
  },
}

const FALLBACK: IslandKind = {
  label: 'Сповіщення',
  action: 'Відкрити',
  icon: BellIcon,
  tone: 'accent',
}

/**
 * Звільняє місце під нову картку. Бібліотека складає тости стовпчиком
 * без обмеження, і пачка сповіщень за раз (пропущене за час без
 * мережі, кілька відгуків поспіль) їхала вниз за край екрана. Тож на
 * екрані не більше MAX_VISIBLE карток і не більше, ніж влазить у висоту
 * вікна; зайві — найстаріші — закриваються. Саме сповіщення не
 * губиться: воно в стрічці й у лічильнику.
 *
 * Тости бібліотеки йдуть від нового до старого. Повтор тієї самої події
 * сюди не доходить — його відсіює showNotificationToast.
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
  // id сповіщення: та сама подія, що прийшла двічі (перепідключення
  // Pusher), не дасть двох карток.
  const id = `${ID_PREFIX}${n.id}`

  // Повтор, поки картка ще на екрані чи вже зникає, — пропускаємо, а не
  // оновлюємо за тим самим id. Бібліотека не забуває спрацьований таймер
  // закриття (див. showCopied у $lib/utils/clipboard): картка, оживлена
  // повтором під час зникання, нового таймера не отримала б і висіла б.
  if (useToasterState().toasts.some((t) => t.id === id)) return

  makeRoom(id)

  toast.custom<IslandProps>(Island, {
    id,
    duration: DURATION,
    // Правий верхній кут, як сповіщення macOS: посередині картка
    // закривала б заголовок сторінки. На телефоні вона майже на всю
    // ширину, тож той самий кут там — це просто «вгорі».
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
