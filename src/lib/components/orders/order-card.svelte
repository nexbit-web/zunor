<!--
  Картка замовлення в списку — тією ж мовою, що й картка заявки
  (jobs/job-card): угорі коли востаннє рухалось і стан, великий заголовок,
  рядок фактів через рисочки (послуга з іконкою, день, ціна), сірі теги
  характеристик, а внизу — друга сторона угоди.

  Опису немає навмисно: замовлення людина вже знає, у списку вона шукає
  «яке з них» і «що з ним зараз», а не перечитує задачу. Повністю він —
  на сторінці замовлення.

  Стилі — класами по токенах теми, без інлайнового `style="...var(--card)"`.
  Інлайн не переживає зміну теми в дизайні й не перевикористовується: коли
  токен `--brand` колись прибрали, розмітка з посиланням на нього лишилась,
  і підсвітка мовчки перестала малюватись.
-->
<script lang="ts">
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import ServiceIcon from '$lib/categories/cleaning/service-icon.svelte'
  import { serviceLabel, resolveWhen } from '$lib/categories/cleaning/presets'
  import { jobTags } from '$lib/components/jobs/display'
  import { ORDER_STATUS_LABEL, formatMoney } from '$lib/orders/labels'
  // Дата відповідає на питання «коли це востаннє рухалось».
  import { formatRelative, formatFull, formatDay } from '$lib/utils/time'
  import type { OrderStatus } from '../../../generated/prisma/client'

  interface Props {
    order: {
      id: string
      title: string
      metadata?: unknown
      priceCents: number
      currency: string
      status: OrderStatus
      createdAt: string
      updatedAt: string
      /** Коли створено заявку: від неї рахуються «сьогодні/завтра». */
      jobCreatedAt?: string | null
      startedAt: string | null
      completedAt: string | null
      clientId: string
      masterId: string
      client: {
        id: string
        name: string | null
        username: string | null
        avatar: string | null
      }
      master: {
        id: string
        name: string | null
        username: string | null
        avatar: string | null
      }
    }
    viewerId: string
  }

  let { order, viewerId }: Props = $props()

  const isClient = $derived(viewerId === order.clientId)
  const peer = $derived(isClient ? order.master : order.client)
  const isCancelled = $derived(order.status === 'CANCELLED')

  const meta = $derived(
    (order.metadata && typeof order.metadata === 'object'
      ? order.metadata
      : {}) as Record<string, unknown>,
  )
  const service = $derived(meta.service)
  const label = $derived(
    typeof service === 'string' ? serviceLabel(service) : 'Прибирання',
  )

  // «today/tomorrow» у metadata — відносно дня СТВОРЕННЯ заявки, а
  // замовлення зʼявляється пізніше, коли клієнт обрав майстра. Від дати
  // замовлення «завтра» зсувалось би на день-два вперед.
  const base = $derived(order.jobCreatedAt ?? order.createdAt)
  const day = $derived.by(() => {
    const iso = resolveWhen(meta.when, base)
    return iso ? formatDay(iso) : ''
  })
  const tags = $derived(jobTags(order.metadata, base))

  /**
   * Статус має читатись кольором за пів секунди, і кольори ті самі, що в
   * плашці заявки (jobs/job-state): жовтий — майстра обрано, робота ще не
   * почалась; акцент із пульсом — іде просто зараз; зелений — закрито;
   * сірий — скасовано.
   */
  const STATUS_TONE: Record<OrderStatus, string> = {
    CREATED: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
    IN_PROGRESS: 'bg-primary/10 text-primary',
    COMPLETED: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
    CANCELLED: 'bg-muted text-muted-foreground',
  }
</script>

<a
  href="/dashboard/orders/{order.id}"
  class={[
    'group block rounded-2xl border border-border bg-card px-5 py-4.5 transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:px-6 sm:py-5',
    isCancelled && 'opacity-70',
  ]}
>
  <div class="flex items-start justify-between gap-4">
    <p class="pt-0.5 text-[13px] text-muted-foreground">
      Оновлено
      <time datetime={order.updatedAt} title={formatFull(order.updatedAt)}
        >{formatRelative(order.updatedAt)}</time
      >
    </p>

    <span
      class={[
        'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium whitespace-nowrap',
        STATUS_TONE[order.status],
      ]}
    >
      <!-- Пульс — лише «у роботі»: це єдиний стан, що рухається просто
           зараз. -->
      {#if order.status === 'IN_PROGRESS'}
        <span class="live-dot size-1.5 rounded-full bg-primary"></span>
      {/if}
      {ORDER_STATUS_LABEL[order.status]}
    </span>
  </div>

  <h3
    class="mt-1 text-[17px] leading-snug font-medium text-pretty text-foreground sm:text-lg"
  >
    {order.title}
  </h3>

  <ul
    class="facts mt-1.5 flex flex-wrap items-center gap-y-1 text-[13.5px] text-muted-foreground"
  >
    <li class="inline-flex items-center gap-1.5">
      <ServiceIcon {service} class="size-4.5 text-foreground/80" />
      {label}
    </li>
    {#if day}
      <li>{day}</li>
    {/if}
    <li>
      Ціна:
      <span
        class={[
          'font-medium tabular-nums text-foreground',
          isCancelled && 'line-through',
        ]}
      >
        {formatMoney(order.priceCents, order.currency)}
      </span>
    </li>
  </ul>

  {#if tags.length > 0}
    <ul class="mt-3.5 flex flex-wrap gap-2">
      {#each tags as tag, i (i)}
        <li
          class="rounded-lg bg-muted px-3 py-1.5 text-[13px] font-medium text-foreground/90"
        >
          {tag}
        </li>
      {/each}
    </ul>
  {/if}

  <!-- Друга сторона угоди, не я: клієнт бачить майстра, майстер —
       замовника. -->
  <div class="mt-3.5 flex min-w-0 items-center gap-1.5 text-[13px]">
    <span class="text-muted-foreground">
      {isClient ? 'Майстер' : 'Замовник'}
    </span>
    <Avatar class="ml-0.5 size-5 shrink-0">
      <AvatarImage src={peer.avatar ?? ''} alt="" />
      <AvatarFallback class="bg-muted text-[10px] font-semibold">
        {peer.name?.[0]?.toUpperCase() ?? '?'}
      </AvatarFallback>
    </Avatar>
    <span class="truncate font-medium text-foreground/80">
      {peer.name ?? 'Без імені'}
    </span>
  </div>
</a>

<style>
  /* Рисочка між фактами — як у картці заявки. */
  .facts > li + li {
    margin-left: 12px;
    padding-left: 12px;
    border-left: 1px solid var(--border);
  }

  .live-dot {
    animation: live-pulse 2s ease-in-out infinite;
  }
  @keyframes live-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .live-dot {
      animation: none;
    }
  }
</style>
