// Слова сповіщення за типом: ярлик над заголовком і напис на кнопці дії.
// Спільні для картки в застосунку (toast.ts → island.svelte) і для
// повідомлення в Telegram ($lib/server/telegram): одна подія не повинна
// називатись у двох місцях по-різному.
//
// Окремо від toast.ts, бо той тягне svelte-компоненти іконок, а сервер
// їх не імпортує. Іконка й тон — справа картки, вони лишились там.

export interface KindText {
  /** Одне-два слова над заголовком картки. */
  label: string
  /** Напис на кнопці — що саме станеться, а не «Відкрити». */
  action: string
}

export const KIND_TEXT: Record<string, KindText> = {
  NEW_JOB: { label: 'Нова заявка', action: 'Переглянути заявку' },
  NEW_PROPOSAL: { label: 'Новий відгук', action: 'Переглянути відгук' },
  PROPOSAL_UPDATED: { label: 'Нова ціна', action: 'Переглянути відгук' },
  PROPOSAL_ACCEPTED: { label: 'Вас обрали', action: 'Відкрити замовлення' },
  ORDER_STARTED: { label: 'Робота почалась', action: 'Відкрити замовлення' },
  ORDER_COMPLETED: { label: 'Роботу завершено', action: 'Залишити відгук' },
  ORDER_CANCELLED: { label: 'Скасовано', action: 'Деталі замовлення' },
  ORDER_REMINDER: { label: 'Нагадування', action: 'Відкрити замовлення' },
  JOB_REOPENED: { label: 'Шукаємо нового', action: 'До заявки' },
  JOB_UPDATED: { label: 'Заявку змінено', action: 'Переглянути заявку' },
  VERIFICATION_APPROVED: { label: 'Верифікація', action: 'Мій профіль' },
  VERIFICATION_REJECTED: { label: 'Верифікація', action: 'Виправити профіль' },
  REPORT_RESOLVED: { label: 'Скарга', action: 'Відкрити' },
}

export const FALLBACK_TEXT: KindText = {
  label: 'Сповіщення',
  action: 'Відкрити',
}

export function kindText(type: string): KindText {
  return KIND_TEXT[type] ?? FALLBACK_TEXT
}
