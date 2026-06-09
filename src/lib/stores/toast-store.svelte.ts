// src/lib/stores/toast-store.svelte.ts
//
// Реактивний стор тостів (Svelte 5 runes) + публічний API `toast`.
// Працює як svelte-french-toast: викликаєш toast.success(...) звідки завгодно
// в БРАУЗЕРІ, а <Toaster /> у layout рендерить чергу.
//
// ⚠️ БЕЗПЕКА — чому стор client-only:
// Це module-level singleton. У SvelteKit модулі переживають між запитами на
// сервері, тож серверна мутація такого стану «протекла б» між користувачами.
// Тому add() працює лише в браузері (guard `browser`). На сервері toast.* —
// no-op, items завжди порожній → SSR рендерить нічого. Серверні повідомлення
// показуй так: endpoint повертає БЕЗПЕЧНИЙ загальний текст → клієнт викликає
// toast.error(текст) у обробнику/ефекті. Деталі помилок лишаються в логах.

import { browser } from '$app/environment'

export type ToastType =
  | 'success'
  | 'error'
  | 'warning'
  | 'info'
  | 'default'
  | 'notification'

export type ToastPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export interface ToastAction {
  label: string
  /** Колбек при кліку. Отримує id тоста (можна закрити вручну: toast.dismiss(id)). */
  onClick?: (id: string) => void
}

export interface ToastOptions {
  /** Тривалість у мс. 0 = persistent (висить, поки не закриють). */
  duration?: number
  /** Позиція. Якщо не задано — береться дефолтна з <Toaster position=... />. */
  position?: ToastPosition
  /** Кнопка-дія праворуч від тексту. */
  action?: ToastAction
}

export interface ToastItem {
  id: string
  type: ToastType
  /** Лише ТЕКСТ. Рендериться екранованим — ніякого HTML/користувацької розмітки. */
  message: string
  duration: number
  position: ToastPosition
  action?: ToastAction
  /** Внутрішнє: позначка «йде анімація виходу». Не задавати вручну. */
  leaving: boolean
}

/** Дефолтні тривалості за типом. */
const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 4000,
  error: 5000,
  warning: 6000,
  info: 6000,
  default: 4000,
  notification: 8000,
}

/** Має збігатися з тривалістю .toast-item.out у toast-theme.css. */
const LEAVE_MS = 260

class ToastStore {
  items = $state<ToastItem[]>([])
  defaultPosition = $state<ToastPosition>('top-right')

  add(type: ToastType, message: string, opts: ToastOptions = {}): string {
    // Захист від серверної мутації спільного синглтона (див. шапку файлу).
    if (!browser) return ''

    const id = crypto.randomUUID()
    this.items.push({
      id,
      type,
      message,
      duration: opts.duration ?? DEFAULT_DURATION[type],
      position: opts.position ?? this.defaultPosition,
      action: opts.action,
      leaving: false,
    })
    return id
  }

  /** Запускає анімацію виходу й прибирає тост після LEAVE_MS. */
  dismiss(id: string): void {
    const t = this.items.find((i) => i.id === id)
    if (!t || t.leaving) return
    t.leaving = true
    setTimeout(() => {
      this.items = this.items.filter((i) => i.id !== id)
    }, LEAVE_MS)
  }

  dismissAll(): void {
    for (const t of this.items) this.dismiss(t.id)
  }
}

export const toastStore = new ToastStore()

// ─── Публічний API ───
// toast('текст')                     → default
// toast.success('текст', { ... })    → з опціями
// toast.error / warning / info / default
// toast.dismiss(id) / toast.dismissAll()

type ToastFn = (message: string, opts?: ToastOptions) => string

interface ToastApi extends ToastFn {
  success: ToastFn
  error: ToastFn
  warning: ToastFn
  info: ToastFn
  default: ToastFn
  notification: ToastFn
  dismiss: (id: string) => void
  dismissAll: () => void
}

const base: ToastFn = (message, opts) =>
  toastStore.add('default', message, opts)

export const toast: ToastApi = Object.assign(base, {
  success: (m: string, o?: ToastOptions) => toastStore.add('success', m, o),
  error: (m: string, o?: ToastOptions) => toastStore.add('error', m, o),
  warning: (m: string, o?: ToastOptions) => toastStore.add('warning', m, o),
  info: (m: string, o?: ToastOptions) => toastStore.add('info', m, o),
  default: (m: string, o?: ToastOptions) => toastStore.add('default', m, o),
  notification: (m: string, o?: ToastOptions) =>
    toastStore.add('notification', m, o),
  dismiss: (id: string) => toastStore.dismiss(id),
  dismissAll: () => toastStore.dismissAll(),
})
