<!-- src/routes/(auth)/dashboard/orders/+page.svelte -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { page } from '$app/state'
  import { replaceState } from '$app/navigation'
  import { Briefcase, Check, ChevronDown, Plus } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import OrderCard from '$lib/components/orders/order-card.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  type StatusTab = 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ALL'

  const TAB_LABELS: Record<StatusTab, string> = {
    ACTIVE: 'Активні',
    COMPLETED: 'Завершені',
    CANCELLED: 'Скасовані',
    ALL: 'Усі',
  }

  function tabFromUrl(): StatusTab {
    const t = page.url.searchParams.get('status')
    return t === 'COMPLETED' || t === 'CANCELLED' || t === 'ALL' ? t : 'ACTIVE'
  }

  /**
   * Вкладка живе в $state, а адресний рядок — це її ДЗЕРКАЛО, не джерело.
   *
   * Похідне від `page.url` тут не працює, і це не питання смаку:
   * `replaceState` зі SvelteKit міняє лише `page.state`, а `page.url`
   * лишає старим (див. runtime/client/client.js — у history він навіть
   * зберігає попередній `page.url.href`). Тобто адреса в рядку мінялась,
   * `page.url` — ні, і список перемальовувався тільки після F5, коли
   * заново відпрацьовував `load`.
   *
   * untrack: з URL беремо лише ПОЧАТКОВЕ значення (щоб посилання й
   * перезавантаження працювали), далі вкладку веде сам компонент.
   */
  let activeTab = $state<StatusTab>(untrack(() => tabFromUrl()))

  const isClient = $derived(data.userRole === 'CLIENT')
  const isMaster = $derived(data.userRole === 'MASTER')

  const totalCount = $derived(data.orders.length)

  const counts = $derived<Record<StatusTab, number>>({
    ACTIVE: data.counts.active,
    COMPLETED: data.counts.completed,
    CANCELLED: data.counts.cancelled,
    ALL: totalCount,
  })

  const filtered = $derived.by(() => {
    switch (activeTab) {
      case 'ALL':
        return data.orders
      case 'ACTIVE':
        return data.orders.filter(
          (o) => o.status === 'CREATED' || o.status === 'IN_PROGRESS',
        )
      case 'COMPLETED':
        return data.orders.filter((o) => o.status === 'COMPLETED')
      case 'CANCELLED':
        return data.orders.filter((o) => o.status === 'CANCELLED')
    }
  })

  /**
   * Спершу перемальовуємо список, потім пишемо адресу — щоб посиланням
   * можна було поділитись і щоб F5 лишав ту саму вкладку.
   *
   * replaceState зі SvelteKit, а не з history: він не смикає `load`
   * (усі замовлення вже в пам'яті, фільтр суто клієнтський) і правильно
   * веде внутрішній стан роутера. Шлях беремо з `page.url.pathname` —
   * захардкоджений '/orders' писав в адресу неіснуючий роут без
   * префікса /dashboard, і перезавантаження давало 404.
   */
  function setTab(tab: StatusTab): void {
    if (tab === activeTab) return
    activeTab = tab

    const params = new URLSearchParams(page.url.searchParams)
    if (tab === 'ACTIVE') params.delete('status')
    else params.set('status', tab)

    const qs = params.toString()
    replaceState(qs ? `${page.url.pathname}?${qs}` : page.url.pathname, {})
  }
</script>

<svelte:head>
  <title>Замовлення · Zunor</title>
  <meta
    name="description"
    content="Ваші замовлення на Zunor — як клієнт або майстер"
  />
</svelte:head>

<!--
  max-w-230 — та сама колонка, що в заявках, відгуках і сповіщеннях.
  min-h-svh + flex-col потрібні порожньому стану: він бере flex-1 і стає
  по центру сторінки, а не одразу під заголовком.
-->
<div class="mx-auto flex min-h-svh w-full max-w-230 flex-col px-4 py-8 sm:px-6">
  <header class="mb-6 flex items-center justify-between gap-3 sm:mb-8">
    <div class="flex min-w-0 items-center gap-2.5">
      <h1 class="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
        Замовлення
      </h1>
      {#if data.counts.active > 0}
        <span
          class="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary"
        >
          {data.counts.active}
        </span>
      {/if}
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="secondary"
              size="sm"
              class="font-normal text-muted-foreground"
            >
              <span class="hidden sm:inline">Показати:</span>
              <span class="font-medium text-foreground">
                {TAB_LABELS[activeTab]}
              </span>
              <ChevronDown class="size-3.5 opacity-60" />
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="w-52 rounded-2xl p-1.5">
          {#each ['ACTIVE', 'COMPLETED', 'CANCELLED', 'ALL'] as const as value (value)}
            <DropdownMenu.Item
              class="flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm outline-none data-highlighted:bg-accent"
              onclick={() => setTab(value)}
            >
              <span class="flex items-center gap-2">
                <span>{TAB_LABELS[value]}</span>
                <span class="text-xs tabular-nums text-muted-foreground">
                  {counts[value]}
                </span>
              </span>
              {#if activeTab === value}
                <Check class="size-4 text-ring" />
              {/if}
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      {#if isClient}
        <Button size="sm" href="/dashboard/jobs/new">
          <Plus />
          <span class="hidden sm:inline">Нове замовлення</span>
        </Button>
      {:else if isMaster}
        <Button size="sm" href="/dashboard/jobs">
          <Briefcase />
          <span class="hidden sm:inline">Знайти роботу</span>
        </Button>
      {/if}
    </div>
  </header>

  {#if filtered.length === 0}
    <div
      class="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center"
    >
      <Briefcase class="size-14 text-muted-foreground/70" strokeWidth={1} />

      <h2 class="mt-6 text-lg font-medium">
        {totalCount === 0
          ? 'Замовлень поки немає'
          : `Немає замовлень зі статусом «${TAB_LABELS[activeTab].toLowerCase()}»`}
      </h2>

      <p class="mt-2 max-w-100 text-sm leading-relaxed text-muted-foreground">
        {#if totalCount === 0}
          {#if isClient}
            Створіть заявку — щойно ви оберете майстра, тут зʼявиться
            замовлення.
          {:else if isMaster}
            Відгукуйтесь на заявки: замовлення зʼявиться, щойно клієнт обере
            вас.
          {:else}
            Замовлення зʼявляться тут, коли ви візьмете в них участь.
          {/if}
        {:else}
          Спробуйте інший фільтр — усього замовлень: {totalCount}.
        {/if}
      </p>

      {#if totalCount === 0 && isClient}
        <Button class="mt-6" href="/dashboard/jobs/new">
          <Plus />
          Створити заявку
        </Button>
      {:else if totalCount === 0 && isMaster}
        <Button class="mt-6" href="/dashboard/jobs">
          <Briefcase />
          Знайти роботу
        </Button>
      {:else if totalCount > 0}
        <Button
          variant="secondary"
          size="sm"
          class="mt-6"
          onclick={() => setTab('ALL')}
        >
          Показати всі
        </Button>
      {/if}
    </div>
  {:else}
    <ul class="grid gap-3 sm:grid-cols-2">
      {#each filtered as order (order.id)}
        <li class="min-w-0">
          <OrderCard {order} viewerId={data.viewerId} />
        </li>
      {/each}
    </ul>

    {#if totalCount >= 200}
      <!-- Лоадер бере рівно 200 записів. Мовчки обрізати список не можна:
           людина мала б думати, що старіших замовлень не існує. -->
      <p class="py-6 text-center text-xs text-muted-foreground">
        Показані останні 200 замовлень
      </p>
    {/if}
  {/if}
</div>
