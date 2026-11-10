// Копіювання в буфер — одне на весь застосунок. Результату копіювання не
// видно очима, тому підтвердження обовʼязкове, а збій — тим паче: мовчазна
// невдача гірша за будь-яке повідомлення (AGENTS, розділ 7). Раніше кожен
// екран писав свій try/catch, і половина з них збій просто ковтала.

import toast from 'svelte-hot-french-toast'
import CopiedToast, {
  type CopiedToastProps,
} from '$lib/components/copied-toast.svelte'

/** id плашки, що зараз на екрані (чи вже зникає). */
let shownId: string | null = null

/**
 * Плашка «Скопійовано» посередині екрана (як у Telegram).
 *
 * Повторне копіювання прибирає попередню плашку й показує НОВУ, зі
 * своїм id, — а не оновлює ту саму за сталим id, як було. Бібліотека
 * (svelte-hot-french-toast 4.0.0) памʼятає таймер закриття за id і
 * після спрацювання його не забуває: тост із повтореним id таймера вже
 * не отримував і висів на екрані назавжди (третє копіювання поспіль).
 * Нова плашка ще й сама «спалахує» — видно, що й друге натискання
 * спрацювало.
 *
 * bottom-center — лише окрема черга бібліотеки: стос рахується для кожної
 * позиції окремо, тож острів сповіщень угорі не зсуне плашку й навпаки.
 * Саме місце на екрані задає компонент.
 */
export function showCopied(text = 'Скопійовано'): void {
  if (shownId) toast.remove(shownId)
  shownId = toast.custom<CopiedToastProps>(CopiedToast, {
    duration: 1600,
    position: 'bottom-center',
    props: { text },
  })
}

/** Копіює й показує плашку; false — буфер недоступний (HTTP, дозволи). */
export async function copyToClipboard(
  value: string,
  text?: string,
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    toast.error('Не вдалося скопіювати')
    return false
  }
  showCopied(text)
  return true
}
