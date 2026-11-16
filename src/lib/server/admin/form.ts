// * дії адмінки кидають error() — для форми це сторінка помилки замість тексту
// * під кнопкою. Обгортка робить із HttpError fail(), решту пропускає

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
