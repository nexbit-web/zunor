// src/lib/categories/cleaning/detail-icons.ts
//
// Іконки для рядків, які повертає describeJob(). Це КОНТЕНТ категорії —
// живе поруч із describe.ts, а не в компонентах стрічки.
//
// Чому явна мапа, а не `import * as Icons` з динамічним пошуком за іменем:
// namespace-імпорт тягне В БАНДЛ УСЮ бібліотеку іконок (півтори тисячі
// компонентів), бо tree-shaking не може довести, який ключ візьмуть у
// рантаймі. Саме через це серверний чанк /dashboard/jobs важив 1.2 МБ.
// Точкові імпорти + мапа дають рівно ті іконки, що справді малюються.
//
// Набір імен фіксований: це значення поля `icon` у describe.ts. Додаєш там
// новий рядок — додай іконку сюди, інакше буде фолбек.

import Home from '@lucide/svelte/icons/home'
import Sparkles from '@lucide/svelte/icons/sparkles'
import DoorOpen from '@lucide/svelte/icons/door-open'
import Repeat from '@lucide/svelte/icons/repeat'
import Trash2 from '@lucide/svelte/icons/trash-2'
import AppWindow from '@lucide/svelte/icons/app-window'
import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right'
import Columns2 from '@lucide/svelte/icons/columns-2'
import Building from '@lucide/svelte/icons/building'
import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down'
import Calendar from '@lucide/svelte/icons/calendar'

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
}

/**
 * Іконка за іменем із describeJob(). Невідоме імʼя → null: чип малюється
 * без іконки, а не падає.
 */
export function detailIcon(name: string | undefined): DetailIcon | null {
  if (!name) return null
  return DETAIL_ICONS[name] ?? null
}
