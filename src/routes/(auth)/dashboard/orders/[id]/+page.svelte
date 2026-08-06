<!-- src/routes/(auth)/orders/[id]/+page.svelte -->
<!--
  Сторінка замовлення — на токенах теми (десктоп: контент + sticky sidebar).
  Логіка 1:1: describeJob, derived (isClient/isMaster/peer/peerRating/peerHref),
  статуси + statusDescription, відгуки, copyOrderId + onDestroy, openChat, формат.
  ВАЖЛИВО (безпека): сервер у load має пускати лише сторони замовлення і віддавати
  peer.phone тільки авторизованому — телефон приватний.
-->
<script lang="ts">
  import { goto } from '$app/navigation'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Clock, Copy, Check, Phone, MessageSquare, Star } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import OrderActions from '$lib/components/orders/order-actions.svelte'
  import ReviewForm from '$lib/components/orders/review-form.svelte'
  import { ORDER_STATUS_LABEL, formatPrice } from '$lib/orders/labels'
  import { onDestroy } from 'svelte'
  import type { PageData } from './$types'
  import { describeJob } from '$lib/categories/cleaning/describe'
  import toast from 'svelte-hot-french-toast'

  let { data }: { data: PageData } = $props()

  const details = $derived(describeJob((data.order as any).metadata))

  // ─── Derived ───
  const order = $derived(data.order)
  const isClient = $derived(data.viewerId === order.clientId)
  const isMaster = $derived(data.viewerId === order.masterId)
  const peer = $derived(isClient ? order.master : order.client)

  const peerRating = $derived(
    isClient
      ? {
          avg: order.master.avgRatingAsMaster,
          count: order.master.reviewsCountAsMaster,
        }
      : {
          avg: order.client.avgRatingAsClient,
          count: order.client.reviewsCountAsClient,
        },
  )
  const peerHref = $derived(
    isClient
      ? order.master.username
        ? `/@${order.master.username}`
        : '#'
      : `/dashboard/client/${order.client.id}`,
  )

  const statusLabel = $derived(ORDER_STATUS_LABEL[order.status])

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
  function statusDot(status: string): string {
    if (status === 'COMPLETED')
      return 'bg-emerald-500 ring-4 ring-emerald-500/20'
    if (status === 'CANCELLED')
      return 'bg-destructive ring-4 ring-destructive/20'
    return 'bg-amber-500 ring-4 ring-amber-500/20'
  }

  // ─── Actions ───
  let copyConfirm = $state(false)
  let copyTimeout: ReturnType<typeof setTimeout> | null = null

  async function copyOrderId() {
    try {
      await navigator.clipboard.writeText(order.id)
      copyConfirm = true
      if (copyTimeout) clearTimeout(copyTimeout)
      copyTimeout = setTimeout(() => (copyConfirm = false), 2000)
      toast.success('Скопійовано', { duration: 2000 })
    } catch {
      /* ignore */
    }
  }

  /**
   * Чат заводиться на першому натисканні, а не разом із замовленням —
   * інакше кожен вибір майстра плодив порожній чат в обох списках.
   */
  let openingChat = $state(false)

  async function openChat() {
    if (openingChat) return

    if (order.chatId) {
      goto(`/dashboard/messages/${order.chatId}`)
      return
    }

    openingChat = true
    try {
      const res = await fetch(`/api/orders/${order.id}/chat`, {
        method: 'POST',
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j?.chatId) {
        toast.error(j?.message ?? 'Не вдалося відкрити чат')
        return
      }
      goto(`/dashboard/messages/${j.chatId}`)
    } catch {
      toast.error('Помилка зʼєднання')
    } finally {
      openingChat = false
    }
  }

  onDestroy(() => {
    if (copyTimeout) clearTimeout(copyTimeout)
  })

  const eyebrow =
    'text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase'
  const scard =
    'rounded-[24px] border border-border bg-card shadow-[0_16px_40px_-18px_rgba(0,0,0,0.12)]'
</script>

<svelte:head>
  <title>Замовлення · {order.title} · Zunor</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="order-scope min-h-svh px-6 py-10">
  <div class="mx-auto max-w-250">
    <!-- Breadcrumb + ID -->
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <a
        href="/dashboard/orders"
        class="rounded-sm text-xs text-muted-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >← Усі замовлення</a
      >
      <button
        type="button"
        onclick={copyOrderId}
        class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold tabular-nums text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label="Скопіювати ID замовлення"
      >
        <span>#{orderShortId}</span>
        {#if copyConfirm}<Check
            class="size-3 text-emerald-600"
            aria-hidden="true"
          />{:else}<Copy class="size-3 opacity-50" aria-hidden="true" />{/if}
      </button>
      <span class="sr-only" aria-live="polite"
        >{copyConfirm ? 'ID замовлення скопійовано' : ''}</span
      >
    </div>

    <h1
      class="mb-4.5 text-[28px] font-bold leading-[1.15] tracking-[-0.03em] wrap-break-word text-foreground"
    >
      {order.title}
    </h1>

    <!-- Status banner -->
    <div
      class="mb-6.5 flex items-center gap-3.5 rounded-2xl border border-border bg-card px-4.5 py-4 shadow-[0_10px_30px_-16px_rgba(0,0,0,0.1)]"
    >
      <span
        class="size-2.25 shrink-0 rounded-full {statusDot(order.status)}"
        aria-hidden="true"
      ></span>
      <div class="min-w-0">
        <p
          class="text-[11px] font-bold tracking-[0.08em] text-foreground uppercase"
        >
          {statusLabel}
        </p>
        <p class="mt-0.5 text-[13px] text-muted-foreground">
          {statusDescription(order.status)}
        </p>
      </div>
    </div>

    <!-- Layout -->
    <div class="grid items-start gap-7 lg:grid-cols-[1fr_340px]">
      <!-- MAIN -->
      <div class="flex min-w-0 flex-col gap-6.5">
        {#if details.length > 0}
          <section>
            <h2 class="{eyebrow} mb-3">Деталі замовлення</h2>
            <div
              class="overflow-hidden rounded-2xl border border-border bg-card"
            >
              {#each details as d, i (d.label)}
                {#if d.items}
                  <div
                    class="px-4 py-3 text-sm {i > 0
                      ? 'border-t border-border'
                      : ''}"
                  >
                    <span class="mb-2.5 block text-muted-foreground"
                      >{d.label}</span
                    >
                    <div class="space-y-2">
                      {#each d.items as it (it.name)}
                        <div class="flex items-center justify-between gap-3">
                          <span
                            class="min-w-0 font-medium wrap-break-word text-foreground"
                            >{it.name}</span
                          >
                          <span
                            class="inline-flex h-6 min-w-7 shrink-0 items-center justify-center rounded-full bg-muted px-2 text-xs font-bold tabular-nums text-foreground"
                            >×{it.qty}</span
                          >
                        </div>
                      {/each}
                    </div>
                  </div>
                {:else}
                  <div
                    class="flex items-center justify-between gap-4 px-4 py-3 text-sm {i >
                    0
                      ? 'border-t border-border'
                      : ''}"
                  >
                    <span class="shrink-0 text-muted-foreground">{d.label}</span
                    >
                    <span
                      class="min-w-0 text-right font-semibold wrap-break-word text-foreground"
                      >{d.value}</span
                    >
                  </div>
                {/if}
              {/each}
            </div>
          </section>
        {/if}

        {#if order.description}
          <section>
            <h2 class="{eyebrow} mb-2">Коментар</h2>
            <p
              class="text-[14.5px] leading-relaxed whitespace-pre-wrap wrap-break-word text-foreground"
            >
              {order.description}
            </p>
          </section>
        {/if}

        {#if order.cancelReason && order.status === 'CANCELLED'}
          <section
            class="rounded-2xl border border-destructive/20 bg-destructive/10 p-5"
          >
            <h3
              class="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-destructive uppercase"
            >
              Причина скасування
            </h3>
            <p class="text-sm leading-relaxed wrap-break-word text-foreground">
              {order.cancelReason}
            </p>
          </section>
        {/if}

        <!-- Reviews -->
        {#if order.status === 'COMPLETED'}
          <section>
            <h2 class="{eyebrow} mb-3">Відгуки</h2>

            {#if reviewFromClient}
              <article
                class="mb-3 rounded-[18px] border border-border bg-card p-4"
              >
                <header class="mb-2 flex items-center justify-between gap-2">
                  <span class="text-[12.5px] font-medium text-muted-foreground"
                    >Відгук клієнта про майстра</span
                  >
                  <div
                    class="flex items-center gap-0.5"
                    role="img"
                    aria-label="Оцінка {reviewFromClient.rating} з 5"
                  >
                    {#each Array(5) as _, i (i)}
                      <Star
                        class="size-3.5 {i < reviewFromClient.rating
                          ? 'fill-amber-400 text-amber-400'
                          : 'fill-transparent text-border'}"
                        aria-hidden="true"
                      />
                    {/each}
                  </div>
                </header>
                {#if reviewFromClient.comment}<p
                    class="text-[13.5px] leading-relaxed wrap-break-word text-foreground"
                  >
                    {reviewFromClient.comment}
                  </p>{/if}
              </article>
            {:else if canClientLeaveReview}
              <ReviewForm
                orderId={order.id}
                peerLabel="майстра"
                peerName={order.master.name ?? ''}
              />
            {:else if isMaster}
              <div
                class="mb-3 rounded-[18px] border border-dashed border-border bg-card px-4 py-5 text-center"
              >
                <p class="text-xs text-muted-foreground">
                  Очікуємо відгук від клієнта
                </p>
              </div>
            {/if}

            {#if reviewFromMaster}
              <article class="rounded-[18px] border border-border bg-card p-4">
                <header class="mb-2 flex items-center justify-between gap-2">
                  <span class="text-[12.5px] font-medium text-muted-foreground"
                    >Відгук майстра про клієнта</span
                  >
                  <div
                    class="flex items-center gap-0.5"
                    role="img"
                    aria-label="Оцінка {reviewFromMaster.rating} з 5"
                  >
                    {#each Array(5) as _, i (i)}
                      <Star
                        class="size-3.5 {i < reviewFromMaster.rating
                          ? 'fill-amber-400 text-amber-400'
                          : 'fill-transparent text-border'}"
                        aria-hidden="true"
                      />
                    {/each}
                  </div>
                </header>
                {#if reviewFromMaster.comment}<p
                    class="text-[13.5px] leading-relaxed wrap-break-word text-foreground"
                  >
                    {reviewFromMaster.comment}
                  </p>{/if}
              </article>
            {:else if canMasterLeaveReview}
              <ReviewForm
                orderId={order.id}
                peerLabel="клієнта"
                peerName={order.client.name ?? ''}
              />
            {:else if isClient}
              <div
                class="rounded-[18px] border border-dashed border-border bg-card px-4 py-5 text-center"
              >
                <p class="text-xs text-muted-foreground">
                  Очікуємо відгук від майстра
                </p>
              </div>
            {/if}
          </section>
        {/if}

        <!-- Events -->
        {#if order.events && order.events.length > 0}
          <section>
            <h2 class="{eyebrow} mb-3">Історія подій</h2>
            <ul class="m-0 flex list-none flex-col gap-2 p-0">
              {#each order.events as event (event.id)}
                <li
                  class="flex items-start gap-3 rounded-xl bg-muted px-3.5 py-3"
                >
                  <Clock
                    class="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div class="min-w-0 flex-1">
                    <p
                      class="text-[12.5px] font-semibold wrap-break-word text-foreground"
                    >
                      {event.type}
                    </p>
                    <p class="mt-0.5 text-[11px] text-muted-foreground">
                      {formatDate(event.createdAt)}
                    </p>
                  </div>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
      </div>

      <!-- SIDEBAR -->
      <aside class="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
        <!-- Price -->
        <div class="{scard} p-5.5">
          <p class={eyebrow}>Сума замовлення</p>
          <p
            class="mt-1.5 text-[32px] font-extrabold tracking-[-0.03em] tabular-nums text-foreground"
          >
            {formatPrice(order.priceCents, order.currency)}
          </p>
          {#if order.createdAt}
            <div
              class="mt-4 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground"
            >
              <Clock class="size-3.5 shrink-0" aria-hidden="true" /><span
                >Створено {formatDate(order.createdAt)}</span
              >
            </div>
          {/if}
        </div>

        <!-- Peer -->
        <div class="{scard} p-4.5">
          <p class={eyebrow}>{isClient ? 'Майстер' : 'Замовник'}</p>
          <a
            href={peerHref}
            class="group my-3 flex items-center gap-3.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Avatar
              class="size-12 shrink-0 shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)]"
            >
              <AvatarImage src={peer.avatar ?? ''} alt={peer.name ?? ''} />
              <AvatarFallback
                class="bg-muted text-[17px] font-bold text-muted-foreground"
                >{peer.name?.[0]?.toUpperCase() ?? '?'}</AvatarFallback
              >
            </Avatar>
            <div class="min-w-0">
              <p
                class="truncate text-[14.5px] font-semibold text-foreground group-hover:underline"
              >
                {peer.name}
              </p>
              {#if peerRating.count > 0}
                <p
                  class="mt-0.5 inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground"
                >
                  <Star
                    class="size-3 fill-amber-400 text-amber-400"
                    aria-hidden="true"
                  />
                  <span class="tabular-nums">{peerRating.avg.toFixed(1)}</span
                  ><span>({peerRating.count})</span>
                </p>
              {/if}
            </div>
          </a>

          {#if peer.phone}
            <a
              href="tel:{peer.phone}"
              class="mb-2.5 flex h-11.5 w-full items-center gap-2.5 rounded-[13px] border border-border bg-muted px-3.5 transition-colors hover:border-ring hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Phone
                class="size-4 shrink-0 text-foreground"
                aria-hidden="true"
              />
              <span
                class="text-[14.5px] font-semibold tabular-nums text-foreground"
                >{peer.phone}</span
              >
            </a>
          {/if}

          <Button
            variant="outline"
            class="h-11 w-full cursor-pointer rounded-[13px] font-semibold"
            onclick={openChat}
            disabled={openingChat}
          >
            <MessageSquare class="mr-2 size-4" aria-hidden="true" />
            {order.chatId ? 'Перейти в чат' : 'Написати повідомлення'}
          </Button>
        </div>

        <!-- Actions -->
        <div class="{scard} p-4.5">
          <p class="{eyebrow} mb-3">Дії</p>
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
</div>

<style>
  :global(body:has(.order-scope)) {
    background:
      radial-gradient(
        120% 70% at 12% -5%,
        color-mix(in oklch, var(--muted) 55%, var(--background)) 0%,
        transparent 48%
      ),
      radial-gradient(
        120% 70% at 100% 102%,
        color-mix(in oklch, var(--secondary) 60%, var(--background)) 0%,
        transparent 50%
      ),
      var(--background);
  }
</style>
