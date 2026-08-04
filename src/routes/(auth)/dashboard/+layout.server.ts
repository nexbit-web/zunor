import { SIDEBAR_COOKIE } from '$lib/components/dashboard/sidebar-state'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = ({ cookies }) => {
  return {
    // Читаємо до рендеру — сайдбар одразу малюється в потрібній ширині.
    // Дефолт true (згорнутий): на першому візиті менше шуму,
    // а розгорнути — один клік.
    sidebarCollapsed: cookies.get(SIDEBAR_COOKIE) !== 'false',
  }
}
