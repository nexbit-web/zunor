// * події замовлення, які пише не стейт-машина: службові відмітки, які
// * «Історія подій» людям не показує

/** Нагадування за день надіслано (server/reminders.ts) — щоб не слати вдруге. */
export const REMINDER_EVENT = 'REMINDER_SENT'

/** Події, яких людям у «Історії подій» не показуємо. */
export const SERVICE_EVENTS = [REMINDER_EVENT] as const
