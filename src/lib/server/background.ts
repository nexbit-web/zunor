// Робота, на яку відповідь не чекає: лист із кодом, копія в Telegram,
// картка посилання в чаті, хвиля після відмови майстра.
//
// На одному процесі (Hostinger) вона просто доробляється. На Vercel функцію
// можуть заморозити одразу після відповіді — і лист не пішов би. waitUntil
// просить платформу дочекатись; поза Vercel він нічого не робить.
//
// Нова «не чекаємо» робота на сервері — лише через background(), не
// голим `void проміс`.

import { waitUntil } from '@vercel/functions'

export function background(task: Promise<unknown>, label: string): void {
  const safe = task.catch((err) => {
    console.error(`[background] ${label} failed:`, err)
  })
  try {
    waitUntil(safe)
  } catch {
    // Поза Vercel контексту немає — робота однаково йде у фоні.
  }
}
