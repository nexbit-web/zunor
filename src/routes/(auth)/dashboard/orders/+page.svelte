<!-- src/routes/(auth)/orders/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { Briefcase, Plus } from 'lucide-svelte'
  import { fade } from 'svelte/transition'
  import OrderCard from '$lib/components/orders/order-card.svelte'
  import type { PageData } from './$types'
  import { Button } from '$lib/components/ui/button'

  let { data }: { data: PageData } = $props()

  // ═══════════════════════════════════════════════════════════
  // Types
  // ═══════════════════════════════════════════════════════════

  type StatusTab = 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ALL'

  // ═══════════════════════════════════════════════════════════
  // State (синхронізується з URL)
  // ═══════════════════════════════════════════════════════════

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
          ['CREATED', 'IN_PROGRESS'].includes(o.status),
        )
      case 'COMPLETED':
        return data.orders.filter((o) => o.status === 'COMPLETED')
      case 'CANCELLED':
        return data.orders.filter((o) => o.status === 'CANCELLED')
    }
  })

  const activeCount = $derived(data.counts.active)
  const totalCount = $derived(data.orders.length)
  const isClient = $derived(data.userRole === 'CLIENT')
  const isMaster = $derived(data.userRole === 'MASTER')

  // ═══════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════

  function setStatusTab(tab: StatusTab) {
    if (tab === activeTab) return
    activeTab = tab

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
      {
        value: 'COMPLETED',
        label: 'Завершені',
        count: data.counts.completed,
      },
      {
        value: 'CANCELLED',
        label: 'Скасовані',
        count: data.counts.cancelled,
      },
      { value: 'ALL', label: 'Усі', count: totalCount },
    ])


  function getActiveLabel(n: number): string {
    if (n === 1) return 'активне'
    if (n >= 2 && n <= 4) return 'активних'
    return 'активних'
  }
</script>

<svelte:head>
  <title>Замовлення · Zunor</title>
  <meta
    name="description"
    content="Ваші замовлення на Zunor — як клієнт або майстер"
  />
</svelte:head>

<div class="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-5">
  <!-- ─── Заголовок ─── -->
  <header class="mb-8">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
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
              {activeCount}
              {getActiveLabel(activeCount)}
            </span>
          {/if}
        </div>
        <p class="text-sm mt-2" style="color: var(--muted-foreground)">
          {#if isClient}
            Ваші замовлення — створіть нове або керуйте поточними
          {:else if isMaster}
            Замовлення, які ви виконуєте
          {:else}
            Замовлення в яких ви берете участь
          {/if}
        </p>
      </div>

      {#if isClient}
        <button
          type="button"
          onclick={() => goto('/dashboard/jobs/new')}
          class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-all hover:opacity-90 active:scale-95 shrink-0"
          style="background-color: var(--primary); color: white"
        >
          <Plus class="size-4" strokeWidth={2.25} />
          Нове замовлення
        </button>
      {/if}
    </div>
  </header>

  <!-- ─── Контроли (Status) ─── -->
  <div class="mb-6 space-y-3">

    <!-- Status tabs -->
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
            class="size-14 rounded-xl mx-auto mb-4 flex items-center justify-center"
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
              {#if isClient}
                Створіть першу заявку — і майстри почнуть надсилати пропозиції
              {:else if isMaster}
                Подавайте пропозиції на заявки — і прийняті замовлення зʼявляться тут
              {:else}
                Замовлення зʼявляться тут коли ви візьмете в них участь
              {/if}
            {:else}
              Спробуйте інший статус або скиньте фільтр ролі
            {/if}
          </p>

          {#if totalCount === 0}
            {#if isClient}
              <button
                type="button"
                onclick={() => goto('/dashboard/jobs/new')}
                class="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-xl text-sm font-medium   hover:bg-primary-hover"
                style="background-color: var(--primary); color: white"
              >
                <Plus class="size-4" strokeWidth={2.25} />
                Створити заявку
              </button>
            {:else if isMaster}
              <Button
                type="button"
                onclick={() => goto('/dashboard/jobs')}
                class="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-xl text-sm font-medium   hover:bg-primary-hover"
                
              >
                <Briefcase class="size-4" strokeWidth={2.25} />
                Знайти роботу
              </Button>
            {/if}
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
  .status-tab {
    color: color-mix(in oklch, var(--foreground) 60%, transparent);
  }
  .status-tab:hover {
    color: var(--foreground);
  }
  .status-tab.active {
    color: var(--foreground);
  }
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

  [role='tablist'] {
    scrollbar-width: none;
  }
  [role='tablist']::-webkit-scrollbar {
    display: none;
  }
</style>