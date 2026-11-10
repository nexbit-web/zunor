<!--
  Оболонка адмінки: меню розділів ліворуч (на телефоні — смуга вгорі) і
  контент. Розділи — за роллю ($lib/admin/roles): модератор бачить лише
  анкети й скарги. Ховати пункт — не захист (його тримають гарди на
  сервері), а лише щоб не показувати дверей, які однаково не відчиняться.

  Без введеного коду другого фактора меню немає: на /admin/2fa лише форма.
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { Component } from 'svelte'
  import { page } from '$app/state'
  import { atLeast, ROLE_LABEL, type StaffRole } from '$lib/admin/roles'
  import { ZunorMark } from '$lib/components/icons'
  import Analytics from '$lib/components/icons/set/analytics.svelte'
  import BadgeCheck from '$lib/components/icons/set/badge-check.svelte'
  import Flag from '$lib/components/icons/set/flag.svelte'
  import Users from '$lib/components/icons/set/users.svelte'
  import ShieldCheck from '$lib/components/icons/set/shield-check.svelte'
  import ClipboardList from '$lib/components/icons/set/clipboard-list.svelte'
  import Lock from '$lib/components/icons/set/lock.svelte'
  import LogOut from '$lib/components/icons/set/log-out.svelte'
  import House from '$lib/components/icons/set/house.svelte'
  import toast from 'svelte-hot-french-toast'
  import { signOutAndGo } from '$lib/utils/sign-out'
  import type { LayoutData } from './$types'

  let { data, children }: { data: LayoutData; children: Snippet } = $props()

  interface Item {
    href: string
    label: string
    min: StaffRole
    icon: Component<{ size?: number; strokeWidth?: number }>
    badge?: number
  }

  const items = $derived(
    (
      [
        { href: '/admin', label: 'Огляд', min: 'MANAGER', icon: Analytics },
        {
          href: '/admin/moderation',
          label: 'Анкети',
          min: 'MODERATOR',
          icon: BadgeCheck,
          badge: data.queues?.pendingVerifications,
        },
        {
          href: '/admin/reports',
          label: 'Скарги',
          min: 'MODERATOR',
          icon: Flag,
          badge: data.queues?.openReports,
        },
        { href: '/admin/users', label: 'Користувачі', min: 'MANAGER', icon: Users },
        { href: '/admin/staff', label: 'Співробітники', min: 'ADMIN', icon: ShieldCheck },
        { href: '/admin/log', label: 'Журнал', min: 'ADMIN', icon: ClipboardList },
      ] satisfies Item[]
    ).filter((i) => atLeast(data.staff.role, i.min)),
  )

  // Вихід з акаунта — на сторінку входу: звідти можна зайти іншим
  // акаунтом (звичайним). «Заблокувати» лише ховає адмінку за код.
  let leaving = $state(false)
  async function leave(): Promise<void> {
    if (leaving) return
    leaving = true
    try {
      await signOutAndGo('/')
    } catch {
      leaving = false
      toast.error('Не вдалося вийти. Спробуйте ще раз.')
    }
  }

  const FOOT =
    'flex cursor-pointer items-center gap-1.5 rounded-md py-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60'
  const ICON_BTN =
    'flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground disabled:opacity-60'

  function active(href: string): boolean {
    const p = page.url.pathname
    return href === '/admin' ? p === '/admin' : p === href || p.startsWith(`${href}/`)
  }
</script>

{#if !data.verified}
  {@render children()}
{:else}
  <div class="flex min-h-svh flex-col bg-background md:flex-row">
    <aside
      class="flex shrink-0 flex-col border-b border-sidebar-border bg-(--sidebar-raised) md:sticky md:top-0 md:h-svh md:w-60 md:border-r md:border-b-0"
    >
      <div class="flex items-center gap-2.5 px-4 pt-4 pb-3 md:px-5 md:pt-5">
        <span class="flex size-7 items-center justify-center"><ZunorMark /></span>
        <span class="text-[15px] font-semibold tracking-tight">Zunor</span>
        <span
          class="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary uppercase"
        >
          Admin
        </span>

        <!-- На телефоні підвалу панелі немає — ті самі дії іконками. -->
        <div class="ms-auto flex items-center gap-0.5 md:hidden">
          {#if data.staff.onSite}
            <a href="/dashboard" class={ICON_BTN} aria-label="На сайт"><House size={19} strokeWidth={1.75} /></a>
          {/if}
          <form method="POST" action="/admin/2fa?/lock">
            <button type="submit" class={ICON_BTN} aria-label="Заблокувати адмінку">
              <Lock size={19} strokeWidth={1.75} />
            </button>
          </form>
          <button type="button" class={ICON_BTN} aria-label="Вийти з акаунта" disabled={leaving} onclick={leave}>
            <LogOut size={19} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <nav
        aria-label="Розділи адмінки"
        class="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-1 md:flex-col md:overflow-visible md:px-3"
      >
        {#each items as item (item.href)}
          {@const on = active(item.href)}
          <a
            href={item.href}
            aria-current={on ? 'page' : undefined}
            class={[
              'flex h-10 shrink-0 items-center gap-3 rounded-lg px-3 text-[14.5px] transition-colors',
              on
                ? 'bg-(--sidebar-active) font-medium text-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
            ]}
          >
            <item.icon size={19} strokeWidth={1.75} />
            <span class="whitespace-nowrap">{item.label}</span>
            {#if item.badge}
              <span
                class="ms-auto rounded-full bg-primary px-1.5 py-px text-[11.5px] font-semibold text-primary-foreground tabular-nums"
              >
                {item.badge}
              </span>
            {/if}
          </a>
        {/each}
      </nav>

      <div class="hidden border-t border-sidebar-border px-4 py-3 md:block">
        <p class="truncate text-[13.5px] font-medium">{data.staff.name ?? data.staff.email}</p>
        <p class="text-[12.5px] text-muted-foreground">{ROLE_LABEL[data.staff.role]}</p>
        <div class="mt-2 flex flex-col">
          {#if data.staff.onSite}
            <a href="/dashboard" class={FOOT}>
              <House size={15} strokeWidth={1.75} />
              На сайт
            </a>
          {/if}
          <form method="POST" action="/admin/2fa?/lock">
            <button type="submit" class={FOOT}>
              <Lock size={15} strokeWidth={1.75} />
              Заблокувати адмінку
            </button>
          </form>
          <button type="button" class={FOOT} disabled={leaving} onclick={leave}>
            <LogOut size={15} strokeWidth={1.75} />
            {leaving ? 'Виходимо…' : 'Вийти з акаунта'}
          </button>
        </div>
      </div>
    </aside>

    <main class="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
      <div class="mx-auto w-full max-w-5xl">
        {@render children()}
      </div>
    </main>
  </div>
{/if}
