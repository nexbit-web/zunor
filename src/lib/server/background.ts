// * робота, на яку відповідь не чекає. На Vercel функцію можуть заморозити
// * одразу після відповіді — waitUntil просить платформу дочекатись

import { waitUntil } from '@vercel/functions'

export function background(task: Promise<unknown>, label: string): void {
  const safe = task.catch((err) => {
    console.error(`[background] ${label} failed:`, err)
  })
  try {
    waitUntil(safe)
  } catch {
    // * поза Vercel контексту немає — робота однаково йде у фоні
  }
}
