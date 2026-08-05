<!--
  Картка замовлення в списку.

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
  import { ORDER_STATUS_LABEL, formatMoney } from '$lib/orders/labels'
  import type { OrderStatus } from '../../../generated/prisma/client'

  interface Props {
    order: {
      id: string
      title: string
      priceCents: number
      currency: string
      status: OrderStatus
      createdAt: string
      updatedAt: string
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

  /**
   * Статус має читатись кольором за пів секунди, тому в кожного свій:
   * жовтий — чекає, синій — іде робота, зелений — закрито, сірий —
   * скасовано. Пари відтінків задані під світлу й темну тему явно.
   */
  const STATUS_STYLE: Record<OrderStatus, { chip: string; dot: string }> = {
    CREATED: {
      chip: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
      dot: 'bg-amber-500',
    },
    IN_PROGRESS: {
      chip: 'bg-primary/12 text-primary',
      dot: 'bg-primary',
    },
    COMPLETED: {
      chip: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
      dot: 'bg-emerald-500',
    },
    CANCELLED: {
      chip: 'bg-muted text-muted-foreground',
      dot: 'bg-muted-foreground/50',
    },
  }

  const status = $derived(STATUS_STYLE[order.status])

  // Дата відповідає на питання «коли це востаннє рухалось».
  function formatDate(iso: string): string {
    const date = new Date(iso)
    const min = Math.floor((Date.now() - date.getTime()) / 60_000)
    const hr = Math.floor(min / 60)
    const days = Math.floor(hr / 24)
    if (min < 1) return 'щойно'
    if (min < 60) return `${min} хв тому`
    if (hr < 24) return `${hr} год тому`
    if (days === 1) return 'учора'
    if (days < 7) return `${days} дн тому`
    return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })
  }

  function formatFull(iso: string): string {
    return new Date(iso).toLocaleString('uk-UA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
</script>

<a
  href="/dashboard/orders/{order.id}"
  class="flex h-full flex-col rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none {isCancelled
    ? 'opacity-70'
    : ''}"
>
  <div class="mb-3 flex items-start justify-between gap-3">
    <div class="flex min-w-0 items-center gap-2.5">
      <Avatar class="size-8 shrink-0">
        <AvatarImage src={peer.avatar ?? ''} alt="" />
        <AvatarFallback class="bg-muted text-xs font-semibold">
          {peer.name?.[0]?.toUpperCase() ?? '?'}
        </AvatarFallback>
      </Avatar>
      <div class="min-w-0">
        <p class="text-[11px] text-muted-foreground">
          {isClient ? 'Майстер' : 'Замовник'}
        </p>
        <p class="truncate text-sm font-medium text-foreground">
          {peer.name ?? 'Без імені'}
        </p>
      </div>
    </div>

    <span
      class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium {status.chip}"
    >
      <span class="size-1.5 rounded-full {status.dot}" aria-hidden="true"
      ></span>
      {ORDER_STATUS_LABEL[order.status]}
    </span>
  </div>

  <!-- flex-1 тримає нижній рядок притиснутим до низу, щоб у сітці
       картки з різними назвами закінчувались на одній лінії. -->
  <h3
    class="mb-3 line-clamp-2 flex-1 text-[15px] leading-snug font-medium text-foreground"
  >
    {order.title}
  </h3>

  <div
    class="flex items-center justify-between gap-2 border-t border-border/60 pt-3"
  >
    <time
      datetime={order.updatedAt}
      title={formatFull(order.updatedAt)}
      class="text-xs text-muted-foreground"
    >
      {formatDate(order.updatedAt)}
    </time>
    <span
      class="text-[15px] font-semibold tabular-nums text-foreground {isCancelled
        ? 'line-through opacity-60'
        : ''}"
    >
      {formatMoney(order.priceCents, order.currency)}
    </span>
  </div>
</a>
