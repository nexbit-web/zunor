<!-- src/routes/(auth)/orders/[id]/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import {
    BadgeCheck,
    Star,
    MessageSquare,
    Clock,
    Copy,
    Check,
    LoaderCircle,
  } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import OrderActions from '$lib/components/orders/order-actions.svelte'
  import ReviewForm from '$lib/components/orders/review-form.svelte'
  import {
    ORDER_STATUS_LABEL,
    ORDER_STATUS_COLOR,
    formatPrice,
  } from '$lib/orders/labels'
  import { onDestroy } from 'svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  // ═══════════════════════════════════════════════════════════
  // Derived
  // ═══════════════════════════════════════════════════════════

  const order = $derived(data.order)
  const isClient = $derived(data.viewerId === order.clientId)
  const isMaster = $derived(data.viewerId === order.masterId)
  const peer = $derived(isClient ? order.master : order.client)

  const statusLabel = $derived(ORDER_STATUS_LABEL[order.status])
  const statusColor = $derived(ORDER_STATUS_COLOR[order.status])

  const reviewFromClient = $derived(
    order.reviews.find((r: any) => r.direction === 'CLIENT_TO_MASTER') ?? null,
  )
  const reviewFromMaster = $derived(
    order.reviews.find((r: any) => r.direction === 'MASTER_TO_CLIENT') ?? null,
  )

  const canClientLeaveReview = $derived(
    isClient && order.status === 'COMPLETED' && !reviewFromClient,
  )
  const canMasterLeaveReview = $derived(
    isMaster && order.status === 'COMPLETED' && !reviewFromMaster,
  )

  const orderShortId = $derived(order.id.slice(-8).toUpperCase())

  function formatDate(iso: string | Date): string {
    return new Date(iso).toLocaleDateString('uk-UA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  function statusDescription(status: string): string {
    switch (status) {
      case 'CREATED':
        return 'Очікує початку роботи майстром'
      case 'IN_PROGRESS':
        return 'Майстер працює над замовленням'
      case 'COMPLETED':
        return 'Замовлення успішно завершено'
      case 'CANCELLED':
        return 'Замовлення було скасовано'
      default:
        return ''
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════

  let copyConfirm = $state(false)
  let copyTimeout: ReturnType<typeof setTimeout> | null = null

  async function copyOrderId() {
    try {
      await navigator.clipboard.writeText(order.id)
      copyConfirm = true
      if (copyTimeout) clearTimeout(copyTimeout)
      copyTimeout = setTimeout(() => (copyConfirm = false), 1500)
    } catch {
      // ignore
    }
  }

  function openChat() {
    if (order.chatId) goto(`/messages/${order.chatId}`)
  }

  onDestroy(() => {
    if (copyTimeout) clearTimeout(copyTimeout)
  })
</script>

<svelte:head>
  <title>Замовлення · {order.title} · Zunor</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
  <!-- ─── Breadcrumb + meta ─── -->
  <div class="flex items-center justify-between gap-3 mb-4 flex-wrap">
    <a
      href="/orders"
      class="text-xs hover:underline inline-flex items-center gap-1"
      style="color: var(--muted-foreground)"
    >
      ← Усі замовлення
    </a>

    <button
      type="button"
      onclick={copyOrderId}
      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium tabular-nums cursor-pointer transition-colors hover:bg-[var(--muted)]"
      style="color: var(--muted-foreground)"
      aria-label="Скопіювати ID замовлення"
    >
      <span>#{orderShortId}</span>
      {#if copyConfirm}
        <Check class="size-3" style="color: #16a34a" />
      {:else}
        <Copy class="size-3 opacity-50" />
      {/if}
    </button>
  </div>

  <!-- ─── Header ─── -->
  <header class="mb-5">
    <h1
      class="text-2xl sm:text-3xl font-bold tracking-tight leading-tight"
      style="color: var(--foreground)"
    >
      {order.title}
    </h1>
  </header>

  <!-- ─── Status Banner ─── -->
  <div
    class="rounded-xl px-4 py-3 mb-6 flex items-center gap-3"
    style="background-color: color-mix(in oklch, var(--muted) 60%, transparent);
           border: 1px solid var(--border)"
  >
    <span
      class="size-2 rounded-full shrink-0"
      style="background-color: var(--{statusColor}-500, var(--primary));
             box-shadow: 0 0 0 4px color-mix(in oklch, var(--primary) 12%, transparent)"
      aria-hidden="true"
    ></span>
    <div class="min-w-0">
      <p
        class="text-[11px] font-bold uppercase tracking-[0.08em]"
        style="color: var(--foreground)"
      >
        {statusLabel}
      </p>
      <p
        class="text-xs mt-0.5 leading-snug"
        style="color: var(--muted-foreground)"
      >
        {statusDescription(order.status)}
      </p>
    </div>
  </div>

  <!-- ═══════ Layout ═══════ -->
  <div class="grid lg:grid-cols-[1fr_340px] gap-6 lg:gap-8">
    <!-- ━━━ ОСНОВНИЙ КОНТЕНТ ━━━ -->
    <div class="min-w-0 space-y-6">
      <!-- Description -->
      <section>
        <h2
          class="text-[11px] font-semibold uppercase tracking-[0.08em] mb-2"
          style="color: var(--muted-foreground)"
        >
          Опис замовлення
        </h2>
        <p
          class="text-[14.5px] leading-relaxed whitespace-pre-wrap"
          style="color: var(--foreground)"
        >
          {order.description}
        </p>
      </section>

      <!-- Cancellation reason -->
      {#if order.cancelReason && order.status === 'CANCELLED'}
        <section
          class="rounded-2xl p-5"
          style="background-color: color-mix(in oklch, var(--destructive) 5%, transparent);
                 border: 1px solid color-mix(in oklch, var(--destructive) 18%, transparent)"
        >
          <h3
            class="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1.5"
            style="color: var(--destructive)"
          >
            Причина скасування
          </h3>
          <p class="text-sm leading-relaxed" style="color: var(--foreground)">
            {order.cancelReason}
          </p>
        </section>
      {/if}

      <!-- ─── Reviews ─── -->
      {#if order.status === 'COMPLETED'}
        <section class="space-y-3">
          <h2
            class="text-[11px] font-semibold uppercase tracking-[0.08em]"
            style="color: var(--muted-foreground)"
          >
            Відгуки
          </h2>

          <!-- Відгук клієнта про майстра -->
          {#if reviewFromClient}
            <article
              class="rounded-2xl p-4"
              style="background-color: var(--card); border: 1px solid var(--border)"
            >
              <header class="flex items-center justify-between gap-2 mb-2">
                <span
                  class="text-xs font-medium"
                  style="color: var(--muted-foreground)"
                >
                  Відгук клієнта про майстра
                </span>
                <div class="flex items-center gap-0.5">
                  {#each Array(5) as _, i (i)}
                    <Star
                      class="size-3.5"
                      style="color: {i < reviewFromClient.rating
                        ? '#f59e0b'
                        : 'var(--border)'};
                             fill: {i < reviewFromClient.rating
                        ? '#f59e0b'
                        : 'transparent'}"
                    />
                  {/each}
                </div>
              </header>
              {#if reviewFromClient.comment}
                <p
                  class="text-[13.5px] leading-relaxed"
                  style="color: var(--foreground)"
                >
                  {reviewFromClient.comment}
                </p>
              {/if}
            </article>
          {:else if canClientLeaveReview}
            <ReviewForm
              orderId={order.id}
              peerLabel="майстра"
              peerName={order.master.name ?? ''}
            />
          {:else if isMaster}
            <div
              class="rounded-2xl px-4 py-5 text-center"
              style="background-color: var(--card); border: 1px solid var(--border); border-style: dashed"
            >
              <p class="text-xs" style="color: var(--muted-foreground)">
                Очікуємо відгук від клієнта
              </p>
            </div>
          {/if}

          <!-- Відгук майстра про клієнта -->
          {#if reviewFromMaster}
            <article
              class="rounded-2xl p-4"
              style="background-color: var(--card); border: 1px solid var(--border)"
            >
              <header class="flex items-center justify-between gap-2 mb-2">
                <span
                  class="text-xs font-medium"
                  style="color: var(--muted-foreground)"
                >
                  Відгук майстра про клієнта
                </span>
                <div class="flex items-center gap-0.5">
                  {#each Array(5) as _, i (i)}
                    <Star
                      class="size-3.5"
                      style="color: {i < reviewFromMaster.rating
                        ? '#f59e0b'
                        : 'var(--border)'};
                             fill: {i < reviewFromMaster.rating
                        ? '#f59e0b'
                        : 'transparent'}"
                    />
                  {/each}
                </div>
              </header>
              {#if reviewFromMaster.comment}
                <p
                  class="text-[13.5px] leading-relaxed"
                  style="color: var(--foreground)"
                >
                  {reviewFromMaster.comment}
                </p>
              {/if}
            </article>
          {:else if canMasterLeaveReview}
            <ReviewForm
              orderId={order.id}
              peerLabel="клієнта"
              peerName={order.client.name ?? ''}
            />
          {:else if isClient}
            <div
              class="rounded-2xl px-4 py-5 text-center"
              style="background-color: var(--card); border: 1px solid var(--border); border-style: dashed"
            >
              <p class="text-xs" style="color: var(--muted-foreground)">
                Очікуємо відгук від майстра
              </p>
            </div>
          {/if}
        </section>
      {/if}

      <!-- Events timeline (простой список вместо компонента) -->
      {#if order.events && order.events.length > 0}
        <section>
          <h2
            class="text-[11px] font-semibold uppercase tracking-[0.08em] mb-3"
            style="color: var(--muted-foreground)"
          >
            Історія подій
          </h2>
          <ul class="list-none p-0 m-0 space-y-2">
            {#each order.events as event (event.id)}
              <li
                class="flex items-start gap-3 p-3 rounded-lg"
                style="background-color: var(--muted)"
              >
                <Clock
                  class="size-3.5 shrink-0 mt-0.5"
                  style="color: var(--muted-foreground)"
                />
                <div class="min-w-0 flex-1">
                  <p
                    class="text-xs font-medium"
                    style="color: var(--foreground)"
                  >
                    {event.type}
                  </p>
                  <p
                    class="text-[11px] mt-0.5"
                    style="color: var(--muted-foreground)"
                  >
                    {formatDate(event.createdAt)}
                  </p>
                </div>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>

    <!-- ━━━ SIDEBAR ━━━ -->
    <aside class="lg:sticky lg:top-6 lg:self-start space-y-3">
      <!-- Price -->
      <div
        class="rounded-2xl p-5"
        style="background-color: var(--card); border: 1px solid var(--border)"
      >
        <p
          class="text-[10px] uppercase tracking-[0.08em] font-semibold"
          style="color: var(--muted-foreground)"
        >
          Сума замовлення
        </p>
        <p
          class="text-3xl font-bold tabular-nums tracking-tight mt-1.5"
          style="color: var(--foreground)"
        >
          {formatPrice(order.priceCents, order.currency)}
        </p>

        {#if order.createdAt}
          <div class="mt-4 pt-4" style="border-top: 1px solid var(--border)">
            <div
              class="flex items-center gap-2 text-xs"
              style="color: var(--muted-foreground)"
            >
              <Clock class="size-3.5 shrink-0" />
              <span>Створено {formatDate(order.createdAt)}</span>
            </div>
          </div>
        {/if}
      </div>

      <!-- Peer card -->
      <div
        class="rounded-2xl p-4"
        style="background-color: var(--card); border: 1px solid var(--border)"
      >
        <p
          class="text-[10px] uppercase tracking-[0.08em] font-semibold mb-3"
          style="color: var(--muted-foreground)"
        >
          {isClient ? 'Майстер' : 'Замовник'}
        </p>

        <a
          href={peer.username ? `/@${peer.username}` : '#'}
          class="flex items-center gap-3 mb-3 group"
        >
          <Avatar class="size-12 shrink-0">
            <AvatarImage src={peer.avatar ?? ''} alt={peer.name ?? ''} />
            <AvatarFallback
              class="text-sm font-semibold"
              style="background-color: var(--muted); color: var(--foreground)"
            >
              {peer.name?.[0]?.toUpperCase() ?? '?'}
            </AvatarFallback>
          </Avatar>
          <div class="min-w-0">
            <div class="flex items-center gap-1">
              <p
                class="text-sm font-semibold truncate group-hover:underline"
                style="color: var(--foreground)"
              >
                {peer.name}
              </p>
            </div>
            {#if peer.reviewsCount && peer.reviewsCount > 0}
              <p
                class="text-[11px] inline-flex items-center gap-1 mt-0.5"
                style="color: var(--muted-foreground)"
              >
                <Star class="size-3" style="fill: #f59e0b; color: #f59e0b" />
                <span class="tabular-nums">
                  {peer.avgRating?.toFixed(1) ?? '—'}
                </span>
                <span>({peer.reviewsCount})</span>
              </p>
            {/if}
          </div>
        </a>

        <Button
          variant="outline"
          class="w-full h-10 rounded-lg cursor-pointer"
          onclick={openChat}
          disabled={!order.chatId}
        >
          <MessageSquare class="size-4 mr-2" />
          Перейти в чат
        </Button>
      </div>

      <!-- Actions -->
      <div
        class="rounded-2xl p-4"
        style="background-color: var(--card); border: 1px solid var(--border)"
      >
        <p
          class="text-[10px] uppercase tracking-[0.08em] font-semibold mb-3"
          style="color: var(--muted-foreground)"
        >
          Дії
        </p>
        <OrderActions
          orderId={order.id}
          status={order.status}
          {isClient}
          {isMaster}
          chatId={order.chatId}
        />
      </div>
    </aside>
  </div>
</div>
