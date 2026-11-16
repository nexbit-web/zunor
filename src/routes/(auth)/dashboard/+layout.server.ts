import { SIDEBAR_COOKIE_NAME } from '$lib/components/ui/sidebar/constants.js'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = ({ cookies }) => {
  return {
    // * читаємо до рендеру: панель одразу потрібної ширини, без ривка після
    // * гідратації. Дефолт — згорнуто
    sidebarOpen: cookies.get(SIDEBAR_COOKIE_NAME) === 'true',
  }
}
