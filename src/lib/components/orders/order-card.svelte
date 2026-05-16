<script lang="ts">
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { ArrowRight } from 'lucide-svelte'
  import {
    ORDER_STATUS_LABEL,
    formatMoney,
    formatRelative,
  } from '$lib/orders/labels'
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
  const statusLabel = $derived(ORDER_STATUS_LABEL[order.status])
</script>

<a
  href={`/orders/${order.id}`}
  class="block rounded-xl p-4 transition-all hover:opacity-95"
  style="background-color: var(--card); border: 1px solid var(--border)"
>
  <div class="flex items-start justify-between gap-3 mb-3">
    <div class="flex items-center gap-2.5 min-w-0 flex-1">
      <Avatar class="size-8 shrink-0">
        <AvatarImage src={peer.avatar ?? ''} alt={peer.name ?? ''} />
        <AvatarFallback
          class="text-xs font-semibold"
          style="background-color: var(--muted); color: var(--foreground)"
        >
          {peer.name?.[0]?.toUpperCase() ?? '?'}
        </AvatarFallback>
      </Avatar>
      <div class="min-w-0">
        <p class="text-xs" style="color: var(--muted-foreground)">
          {isClient ? 'Майстер' : 'Замовник'}
        </p>
        <p
          class="text-sm font-medium truncate"
          style="color: var(--foreground)"
        >
          {peer.name}
        </p>
      </div>
    </div>
    <span
      class="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded shrink-0"
      style="background-color: var(--muted); color: var(--foreground)"
    >
      {statusLabel}
    </span>
  </div>

  <h3
    class="text-[15px] font-semibold leading-snug line-clamp-2 mb-2"
    style="color: var(--foreground)"
  >
    {order.title}
  </h3>

  <div
    class="flex items-center justify-between gap-2 pt-3"
    style="border-top: 1px solid var(--border)"
  >
    <span class="text-[11px]" style="color: var(--muted-foreground)">
      {formatRelative(order.updatedAt)}
    </span>
    <div class="flex items-center gap-2">
      <span
        class="text-base font-bold tabular-nums"
        style="color: var(--foreground)"
      >
        {formatMoney(order.priceCents, order.currency)}
      </span>
      <ArrowRight class="size-4" style="color: var(--muted-foreground)" />
    </div>
  </div>
</a>
