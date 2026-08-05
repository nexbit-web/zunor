// src/lib/zunor/dialog-storage.ts
//
// Незавершений діалог з асистентом переживає перезавантаження сторінки.
//
// ЧОМУ НЕ В БАЗІ. Кожен хід діалогу — це вже витрачені гроші на DeepSeek.
// До появи цього модуля будь-який F5, випадкове закриття вкладки чи
// «назад» у браузері стирали розмову, і людина починала з нуля: платили
// двічі за ту саму заявку. При цьому писати діалог у БД не треба —
// сервер `/api/zunor/chat` і так stateless, він отримує ВСЮ історію в тілі
// запиту. Тобто єдине, чого бракувало, — щоб історія пережила перезавантаження
// на клієнті. Місце в базі витрачати ні до чого: у неї їде лише готова
// заявка, а чернетки розмов там осідали б назавжди.
//
// Ключ включає userId: на спільному комп'ютері наступна людина не має
// побачити чужу розмову про її квартиру.
//
// TTL добу: діалог тижневої давності — це вже не «продовжити», а сюрприз.

import { browser } from '$app/environment'
import type { ZunorDraft } from '$lib/types/zunor'

/** Фото, вже завантажене в Cloudinary. */
export interface ZunorPhoto {
  url: string
  publicId: string
}

/** Повідомлення в стрічці діалогу. Єдине джерело типу — і UI, і сховище. */
export type ZunorDialogMessage =
  | { id: number; role: 'user'; text: string; images?: string[] }
  | {
      id: number
      role: 'zunor'
      text: string
      /** Скільки символів уже надруковано ефектом друкарки. */
      shown: number
      typing: boolean
      thinkSeconds: number
    }
  | { id: number; role: 'summary'; draft: ZunorDraft }

export interface ZunorDialog {
  messages: ZunorDialogMessage[]
  chips: string[]
  sentPhotos: ZunorPhoto[]
  pendingPhotos: ZunorPhoto[]
  nextMsgId: number
}

interface StoredEnvelope extends ZunorDialog {
  /** Версія формату. Не збігається — вважаємо, що збереженого немає. */
  v: number
  savedAt: number
}

const VERSION = 1
const TTL_MS = 24 * 60 * 60_000

/** Стеля на кількість реплік. Сервер однаково бере лише останні 24. */
const MAX_MESSAGES = 60

/**
 * Стеля на розмір запису. localStorage дає ~5 МБ на домен НА ВСІ ключі,
 * тож роздувати один — значить зламати решту (гучність звуку, ширина
 * панелей). Переповнення кидає QuotaExceededError, який ми ковтаємо, але
 * тоді збереження просто мовчки не працює — краще не доводити.
 */
const MAX_BYTES = 256 * 1024

function keyFor(userId: string): string {
  return `zunor:dialog:${userId}`
}

/**
 * Нормалізація перед записом: анімація друкарки — стан рендера, а не даних.
 * Зберігаємо репліку вже «надрукованою», інакше після відновлення частина
 * тексту лишилась би прихованою назавжди (`shown` менший за довжину).
 */
function freeze(messages: ZunorDialogMessage[]): ZunorDialogMessage[] {
  return messages.map((m) =>
    m.role === 'zunor' ? { ...m, shown: m.text.length, typing: false } : m,
  )
}

/** Зберігає діалог. Ніколи не кидає: збій сховища не має ламати чат. */
export function saveDialog(userId: string, dialog: ZunorDialog): void {
  if (!browser || !userId) return

  try {
    const messages = freeze(dialog.messages).slice(-MAX_MESSAGES)
    const envelope: StoredEnvelope = {
      ...dialog,
      messages,
      v: VERSION,
      savedAt: Date.now(),
    }

    const raw = JSON.stringify(envelope)
    // Один довгий діалог не має права з'їсти квоту домену.
    if (raw.length > MAX_BYTES) return

    localStorage.setItem(keyFor(userId), raw)
  } catch {
    // Приватний режим, вимкнене сховище, вичерпана квота — не наша проблема:
    // чат продовжує працювати, просто без відновлення після F5.
  }
}

/**
 * Читає збережений діалог. Повертає null, якщо його немає, він протух,
 * записаний іншою версією формату або пошкоджений.
 */
export function loadDialog(userId: string): ZunorDialog | null {
  if (!browser || !userId) return null

  try {
    const raw = localStorage.getItem(keyFor(userId))
    if (!raw) return null

    const data = JSON.parse(raw) as Partial<StoredEnvelope>
    if (data.v !== VERSION) {
      clearDialog(userId)
      return null
    }
    if (
      typeof data.savedAt !== 'number' ||
      Date.now() - data.savedAt > TTL_MS
    ) {
      clearDialog(userId)
      return null
    }
    if (!Array.isArray(data.messages) || data.messages.length === 0) return null

    return {
      messages: freeze(data.messages),
      chips: Array.isArray(data.chips) ? data.chips : [],
      sentPhotos: Array.isArray(data.sentPhotos) ? data.sentPhotos : [],
      pendingPhotos: Array.isArray(data.pendingPhotos)
        ? data.pendingPhotos
        : [],
      // Фолбек рахує id від збережених реплік: без нього нові повідомлення
      // отримали б ті самі id, і Svelte переплутав би їх у keyed-блоці.
      nextMsgId:
        typeof data.nextMsgId === 'number'
          ? data.nextMsgId
          : Math.max(0, ...data.messages.map((m) => m.id)) + 1,
    }
  } catch {
    // Пошкоджений JSON — прибираємо, щоб не спотикатись об нього щоразу.
    clearDialog(userId)
    return null
  }
}

/** Прибирає збережений діалог. Викликати, коли заявку вже створено. */
export function clearDialog(userId: string): void {
  if (!browser || !userId) return
  try {
    localStorage.removeItem(keyFor(userId))
  } catch {
    // див. saveDialog
  }
}
