<!--
  Рядок замовлення в списку.

  Прийшов на зміну картці: список замовлень — це таблиця справ, а не
  вітрина. Картка з рамкою, аватаром і стрілкою забирала пів екрана на
  чотири факти (назва, статус, з ким, скільки), і два замовлення поспіль
  уже не вміщались. Рядок дає ті самі факти в двох лініях.
-->
<script lang="ts">
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
      client: { id: string; name: string | null }
      master: { id: string; name: string | null }
    }
    viewerId: string
  }

  let { order, viewerId }: Props = $props()

  const isClient = $derived(viewerId === order.clientId)
  const peer = $derived(isClient ? order.master : order.client)
  const isCancelled = $derived(order.status === 'CANCELLED')

  /**
   * Крапка статусу. Кольори задані класами, а не через `var(--...)`:
   * токен `--brand` уже одного разу видалили, а розмітка лишилась із
   * посиланням на нього — і підсвітка мовчки перестала малюватись.
   */
  const STATUS_DOT: Record<OrderStatus, string> = {
    CREATED: 'bg-amber-500',
    IN_PROGRESS: 'bg-primary',
    COMPLETED: 'bg-emerald-500',
    CANCELLED: 'bg-muted-foreground/40',
  }

  // Дата в правій колонці відповідає на питання «коли це востаннє
  // рухалось» — для завершених і скасованих це момент закриття.
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
  class="-mx-3 flex items-center gap-4 rounded-lg px-3 py-4 transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
>
  <div class="min-w-0 flex-1">
    <p
      class="truncate text-[15px] {isCancelled
        ? 'text-muted-foreground'
        : 'font-medium text-foreground'}"
    >
      {order.title}
    </p>
    <p
      class="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground"
    >
      <span
        class="size-1.5 shrink-0 rounded-full {STATUS_DOT[order.status]}"
        aria-hidden="true"
      ></span>
      <span class="shrink-0">{ORDER_STATUS_LABEL[order.status]}</span>
      {#if peer.name}
        <span class="shrink-0 opacity-50">·</span>
        <span class="truncate">
          <span class="sr-only">{isClient ? 'майстер' : 'замовник'}:</span>
          {peer.name}
        </span>
      {/if}
    </p>
  </div>

  <div class="shrink-0 text-right">
    <p
      class="text-[15px] tabular-nums {isCancelled
        ? 'text-muted-foreground line-through'
        : 'font-medium text-foreground'}"
    >
      {formatMoney(order.priceCents, order.currency)}
    </p>
    <time
      datetime={order.updatedAt}
      title={formatFull(order.updatedAt)}
      class="mt-1 block text-[13px] whitespace-nowrap text-muted-foreground"
    >
      {formatDate(order.updatedAt)}
    </time>
  </div>
</a>
