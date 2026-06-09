// src/lib/components/toast/icons.ts
//
// Іконки тостів з lucide (@lucide/svelte). Deep-імпорт по одній іконці —
// у бандл потрапляють лише ці, без барелю (легко й tree-shakeable).
// Колір успадковується від .t-icon через currentColor.

import type { ToastType } from '$lib/stores/toast-store.svelte'
import CircleCheck from '@lucide/svelte/icons/circle-check'
import CircleX from '@lucide/svelte/icons/circle-x'
import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
import Info from '@lucide/svelte/icons/info'
import Bell from '@lucide/svelte/icons/bell'
import X from '@lucide/svelte/icons/x'

/** Іконка за типом тоста. (Усі lucide-іконки одного компонентного типу.) */
export const ICONS: Record<ToastType, typeof Info> = {
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
  default: Info, // як в оригіналі: default і info — однакова іконка, різний колір
  notification: Bell,
}

/** Іконка кнопки закриття. */
export const CloseIcon = X
