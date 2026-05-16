<!-- src/routes/(auth)/orders/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { Briefcase, Plus, Filter, User, Hammer, Users } from 'lucide-svelte'
  import { fade } from 'svelte/transition'
  import OrderCard from '$lib/components/orders/order-card.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  // ═══════════════════════════════════════════════════════════
  // Types
  // ═══════════════════════════════════════════════════════════

  type StatusTab = 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ALL'
  type RoleFilter = 'all' | 'client' | 'freelancer'

  // ═══════════════════════════════════════════════════════════
  // State (синхронізується з URL)
  // ═══════════════════════════════════════════════════════════

  // Беремо initial з URL — щоб back/forward у браузері працював
  function getInitialTab(): StatusTab {
    const t = page.url.searchParams.get('status')
    if (t === 'COMPLETED' || t === 'CANCELLED' || t === 'ALL') return t
    return 'ACTIVE'
  }

  let activeTab = $state<StatusTab>(getInitialTab())

  // ═══════════════════════════════════════════════════════════
  // Derived
  // ═══════════════════════════════════════════════════════════

  const filtered = $derived.by(() => {
    switch (activeTab) {
      case 'ALL':
        return data.orders
      case 'ACTIVE':
        return data.orders.filter((o) =>
          ['NEGOTIATING', 'ACCEPTED', 'DELIVERED'].includes(o.status),
        )
      case 'COMPLETED':
        return data.orders.filter((o) => o.status === 'COMPLETED')
      case 'CANCELLED':
        return data.orders.filter((o) => o.status === 'CANCELLED')
    }
  })

  // Підсумок для заголовку — швидке відчуття «де я і що робиться»
  const activeCount = $derived(data.counts.active)
  const totalCount = $derived(data.orders.length)

  // ═══════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════

  function setRole(role: RoleFilter) {
    if (role === data.roleFilter) return // не робимо зайвий goto

    const params = new URLSearchParams()
    if (role !== 'all') params.set('role', role)
    if (activeTab !== 'ACTIVE') params.set('status', activeTab)

    const qs = params.toString()
    goto(qs ? `/orders?${qs}` : '/orders', {
      keepFocus: true,
      noScroll: true,
    })
  }

  function setStatusTab(tab: StatusTab) {
    if (tab === activeTab) return
    activeTab = tab

    // Синхронізуємо з URL (без goto, щоб не перезавантажувати loader)
    const params = new URLSearchParams(page.url.searchParams)
    if (tab === 'ACTIVE') {
      params.delete('status')
    } else {
      params.set('status', tab)
    }
    const qs = params.toString()
    const newUrl = qs ? `/orders?${qs}` : '/orders'
    history.replaceState(history.state, '', newUrl)
  }

  // ═══════════════════════════════════════════════════════════
  // Tabs config
  // ═══════════════════════════════════════════════════════════

  const statusTabs: { value: StatusTab; label: string; count: number }[] =
    $derived([
      { value: 'ACTIVE', label: 'Активні', count: data.counts.active },
      { value: 'COMPLETED', label: 'Завершені', count: data.counts.completed },
      { value: 'CANCELLED', label: 'Скасовані', count: data.counts.cancelled },
      { value: 'ALL', label: 'Усі', count: totalCount },
    ])

  const roleOptions: {
    value: RoleFilter
    label: string
    icon: typeof Users
  }[] = [
    { value: 'all', label: 'Усі', icon: Users },
    { value: 'client', label: 'Як клієнт', icon: User },
    { value: 'freelancer', label: 'Як майстер', icon: Hammer },
  ]
</script>

<svelte:head>
  <title>Замовлення · Zunor</title>
  <meta
    name="description"
    content="Ваші замовлення на Zunor — як клієнт або виконавець"
  />
</svelte:head>

<div class="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
  <!-- ─── Заголовок ─── -->
  <header class="mb-8">
    <div class="flex items-baseline gap-3 flex-wrap">
      <h1
        class="text-3xl font-bold tracking-tight"
        style="color: var(--foreground)"
      >
        Замовлення
      </h1>
      {#if activeCount > 0}
        <span
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style="background-color: color-mix(in oklch, var(--primary) 10%, transparent);
                 color: var(--primary)"
        >
          <span
            class="size-1.5 rounded-full"
            style="background-color: var(--primary)"
          ></span>
          {activeCount} активн{activeCount === 1
            ? 'е'
            : activeCount < 5
              ? 'их'
              : 'их'}
        </span>
      {/if}
    </div>
    <p class="text-sm mt-2" style="color: var(--muted-foreground)">
      Замовлення в яких ви берете участь — як клієнт або як виконавець
    </p>
  </header>

  <!-- ─── Контроли (Role + Status) ─── -->
  <div class="mb-6 space-y-3">
    <!-- Role filter — segmented control -->
    <div class="flex items-center gap-3 flex-wrap">
      <span
        class="text-[11px] font-medium uppercase tracking-wider hidden sm:inline"
        style="color: var(--muted-foreground)"
      >
        Роль
      </span>
      <div
        class="inline-flex rounded-full p-0.5 gap-0.5"
        style="background-color: var(--muted); border: 1px solid var(--border)"
        role="radiogroup"
        aria-label="Фільтр за роллю"
      >
        {#each roleOptions as opt (opt.value)}
          {@const isActive = data.roleFilter === opt.value}
          <button
            type="button"
            onclick={() => setRole(opt.value)}
            role="radio"
            aria-checked={isActive}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all"
            style="background-color: {isActive
              ? 'var(--background)'
              : 'transparent'};
                   color: {isActive
              ? 'var(--foreground)'
              : 'var(--muted-foreground)'};
                   box-shadow: {isActive
              ? '0 1px 2px rgba(0,0,0,0.06)'
              : 'none'}"
          >
            <opt.icon class="size-3.5" strokeWidth={2} aria-hidden="true" />
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Status tabs — underline-style, як у Linear -->
    <div
      class="flex items-center gap-0 border-b overflow-x-auto"
      style="border-color: var(--border)"
      role="tablist"
      aria-label="Статус замовлень"
    >
      {#each statusTabs as tab (tab.value)}
        {@const isActive = activeTab === tab.value}
        <button
          type="button"
          onclick={() => setStatusTab(tab.value)}
          role="tab"
          aria-selected={isActive}
          class="status-tab inline-flex items-center gap-2 px-4 py-3 text-sm font-medium cursor-pointer transition-colors whitespace-nowrap relative"
          class:active={isActive}
        >
          <span>{tab.label}</span>
          {#if tab.count > 0}
            <span
              class="text-[11px] tabular-nums px-1.5 py-0.5 rounded font-semibold"
              style="background-color: {isActive
                ? 'color-mix(in oklch, var(--foreground) 8%, transparent)'
                : 'var(--muted)'};
                     color: {isActive
                ? 'var(--foreground)'
                : 'var(--muted-foreground)'}"
            >
              {tab.count}
            </span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- ─── Контент ─── -->
  {#key activeTab}
    <div in:fade={{ duration: 120 }}>
      {#if filtered.length === 0}
        <!-- Empty state -->
        <div
          class="rounded-2xl px-6 py-14 sm:py-20 text-center"
          style="background-color: var(--card); border: 1px solid var(--border)"
        >
          <div
            class="size-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style="background-color: var(--muted)"
          >
            <Briefcase
              class="size-6"
              style="color: var(--muted-foreground)"
              strokeWidth={1.75}
            />
          </div>

          <h2
            class="text-base font-semibold mb-1"
            style="color: var(--foreground)"
          >
            {totalCount === 0
              ? 'Немає жодного замовлення'
              : 'Немає замовлень у цій категорії'}
          </h2>

          <p
            class="text-sm max-w-md mx-auto leading-relaxed"
            style="color: var(--muted-foreground)"
          >
            {#if totalCount === 0}
              Замовлення з'являться тут коли ви замовите послугу або
              відгукнетесь на заявку
            {:else}
              Спробуйте інший статус або скиньте фільтр ролі
            {/if}
          </p>

          {#if totalCount === 0}
            <a
              href="/services"
              class="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-full text-sm font-medium cursor-pointer transition-colors"
              style="background-color: var(--foreground); color: var(--background)"
            >
              <Plus class="size-4" strokeWidth={2.25} />
              Знайти майстра
            </a>
          {/if}
        </div>
      {:else}
        <!-- Orders list -->
        <div class="space-y-3">
          {#each filtered as order (order.id)}
            <OrderCard {order} viewerId={data.viewerId} />
          {/each}
        </div>
      {/if}
    </div>
  {/key}
</div>

<style>
  /* ─── Status tabs (Linear-style) ─── */
  .status-tab {
    color: color-mix(in oklch, var(--foreground) 60%, transparent);
  }
  .status-tab:hover {
    color: var(--foreground);
  }
  .status-tab.active {
    color: var(--foreground);
  }
  /* Підкреслення активного таба — псевдоелемент під border-b батька */
  .status-tab.active::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 2px;
    background-color: var(--foreground);
    border-radius: 2px;
  }

  /* Скрол status-tabs на мобайлі без полоси */
  [role='tablist'] {
    scrollbar-width: none;
  }
  [role='tablist']::-webkit-scrollbar {
    display: none;
  }
</style>
