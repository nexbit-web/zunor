// * кореневий лейаут виконується на кожній навігації, тому запитів до бази
// * тут немає: віддаємо лише сесію, яку вже резолвнув hooks.server.ts

import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ locals }) => {
  return { session: locals.session }
}
