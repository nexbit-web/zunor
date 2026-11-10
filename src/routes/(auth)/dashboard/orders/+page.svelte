<script lang="ts">
  import { untrack } from 'svelte'
  import { page } from '$app/state'
  import { replaceState } from '$app/navigation'
  import Briefcase from '$lib/components/icons/set/briefcase.svelte'
  import Check from '$lib/components/icons/set/check.svelte'
  import ChevronDown from '$lib/components/icons/set/chevron-down.svelte'
  import Plus from '$lib/components/icons/set/plus.svelte'
  import { Button } from '$lib/components/ui/button'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import PageHead from '$lib/components/dashboard/page-head.svelte'
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
   * Вкладка живе в $state, а адресний рядок — це її ДЗЕРКАЛО, не джерело:
   * `replaceState` міняє лише `page.state`, а `page.url` лишає старим, тож
   * похідне від нього значення оновлювалось би тільки після F5.
   *
   * untrack: з URL беремо ПОЧАТКОВЕ значення (щоб працювали посилання), далі
   * вкладку веде сам компонент.
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
  Та сама колонка й шапка, що в «Моїх заявках» (jobs/+page.svelte):
  max-w-3xl і картки одна під одною. Сітка у дві колонки стискала назви
  до двох рядків і ставила поруч замовлення, які ніщо не повʼязує.

  min-h-(--app-h) + flex-col потрібні порожньому стану: він бере flex-1 і
  стає по центру сторінки, а не одразу під заголовком. Верхнього падінгу
  тут немає — його тримає `PageHead` (на телефоні більший, під кнопку
  меню).
-->
<div
  class="mx-auto flex min-h-(--app-h) w-full max-w-3xl flex-col px-4 pb-6 sm:px-6 sm:pb-10"
>
  <PageHead>
    <div class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2.5">
        <h1 class="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
          Замовлення
        </h1>
        {#if data.counts.active > 0}
          <span
            class="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary"
            title="Активні замовлення"
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
          <!-- Вигляд меню й пунктів — зі спільного ui/dropdown-menu (як у
               референсі в docs/); тут лише ширина. -->
          <DropdownMenu.Content align="end" class="w-auto min-w-56">
            {#each ['ACTIVE', 'COMPLETED', 'CANCELLED', 'ALL'] as const as value (value)}
              {#if value === 'ALL'}
                <DropdownMenu.Separator />
              {/if}
              <DropdownMenu.Item
                class="cursor-pointer"
                onclick={() => setTab(value)}
              >
                <span class="min-w-0 flex-1 truncate">{TAB_LABELS[value]}</span>
                <span class="text-xs tabular-nums text-muted-foreground">
                  {counts[value]}
                </span>
                <!-- Місце під галочку є завжди: інакше лічильник обраного
                     пункту стрибав би ліворуч. -->
                <Check
                  class="size-4 shrink-0 text-primary {activeTab !== value
                    ? 'invisible'
                    : ''}"
                />
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
    </div>
  </PageHead>

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
    <ul class="mt-2 flex flex-col gap-3">
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
