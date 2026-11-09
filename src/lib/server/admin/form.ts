// Форми адмінки: дії ($lib/server/admin/actions) кидають error() — для
// форми це означало б сторінку помилки замість тексту під кнопкою.
// Обгортка перетворює кинуту HttpError на fail() з повідомленням, а
// redirect() і справжні збої пропускає далі як є.

import { fail, isHttpError } from '@sveltejs/kit'

export async function asForm<T>(
  run: () => Promise<T>,
): Promise<T | ReturnType<typeof fail<{ error: string }>>> {
  try {
    return await run()
  } catch (err) {
    if (isHttpError(err)) return fail(err.status, { error: err.body.message })
    throw err
  }
}

/** Рядок із FormData — обрізаний; не рядок — порожній. */
export function field(fd: FormData, name: string): string {
  const v = fd.get(name)
  return typeof v === 'string' ? v.trim() : ''
}
