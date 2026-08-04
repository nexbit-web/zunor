// Правила показу тостів. Винесено окремо, щоб store не знав нічого
// про UI-бібліотеку: захочете змінити тости — правите лише цей файл.

import toast from 'svelte-hot-french-toast'
import ToastBell from '$lib/components/icons/toast-bell.svelte'
import type { Notification } from './types'

const DURATION = 8000

export function showNotificationToast(n: Notification): void {
  const opts = { duration: DURATION }

  switch (n.type) {
    case 'PROPOSAL_ACCEPTED':
    case 'ORDER_COMPLETED':
      toast.success(n.title, opts)
      break
    case 'ORDER_CANCELLED':
      toast.error(n.title, opts)
      break
    default:
      toast(n.title, { ...opts, icon: ToastBell })
  }
}
