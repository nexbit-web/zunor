// * іконки рядків describeJob() — контент категорії. Явна мапа, а не пошук за
// * іменем: у бандл ідуть лише ті іконки, що малюються. Новий рядок у
// * describe.ts — нова іконка тут

import Home from '$lib/components/icons/set/house.svelte'
import Sparkles from '$lib/components/icons/set/sparkles.svelte'
import DoorOpen from '$lib/components/icons/set/door-open.svelte'
import Repeat from '$lib/components/icons/set/repeat.svelte'
import Trash2 from '$lib/components/icons/set/trash-2.svelte'
import AppWindow from '$lib/components/icons/set/app-window.svelte'
import ArrowLeftRight from '$lib/components/icons/set/arrow-left-right.svelte'
import Columns2 from '$lib/components/icons/set/columns-2.svelte'
import Building from '$lib/components/icons/set/building.svelte'
import ArrowUpDown from '$lib/components/icons/set/arrow-up-down.svelte'
import Calendar from '$lib/components/icons/set/calendar.svelte'
import Ruler from '$lib/components/icons/set/ruler.svelte'

export type DetailIcon = typeof Home

const DETAIL_ICONS: Record<string, DetailIcon> = {
  Home,
  Sparkles,
  DoorOpen,
  Repeat,
  Trash2,
  AppWindow,
  ArrowLeftRight,
  Columns2,
  Building,
  ArrowUpDown,
  Calendar,
  Ruler,
}

/**
 * Іконка за іменем із describeJob(). Невідоме імʼя → null: чип малюється
 * без іконки, а не падає.
 */
export function detailIcon(name: string | undefined): DetailIcon | null {
  if (!name) return null
  return DETAIL_ICONS[name] ?? null
}
