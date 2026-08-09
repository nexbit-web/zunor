import { SIDEBAR_COOKIE_NAME } from '$lib/components/ui/sidebar/constants.js'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = ({ cookies }) => {
  return {
    // Читаємо до рендеру — панель одразу малюється в потрібній ширині,
    // без ривка після гідратації. Пише цю cookie сам Sidebar.Provider,
    // ім'я беремо з його ж констант, щоб вони не розійшлись.
    //
    // Дефолт — згорнуто: на першому візиті менше шуму, а розгорнути це
    // один клік. Захочеш навпаки — тут одне слово.
    sidebarOpen: cookies.get(SIDEBAR_COOKIE_NAME) === 'true',
  }
}
