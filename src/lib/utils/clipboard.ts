// * копіювання в буфер — одне на застосунок. Результату не видно очима, тому
// * підтвердження обовʼязкове, а збій — тим паче

import toast from 'svelte-hot-french-toast'
import CopiedToast, {
  type CopiedToastProps,
} from '$lib/components/copied-toast.svelte'

/** id плашки, що зараз на екрані (чи вже зникає). */
let shownId: string | null = null

/**
 * Плашка «Скопійовано». Повтор показує нову плашку зі своїм id: бібліотека
 * не дає тосту з повтореним id нового таймера закриття.
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
