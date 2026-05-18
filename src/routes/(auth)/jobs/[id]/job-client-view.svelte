<!-- src/routes/(auth)/jobs/[id]/job-client-view.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { Button } from '$lib/components/ui/button'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Badge } from '$lib/components/ui/badge'
  import {
    ArrowLeft,
    MapPin,
    Layers,
    Clock,
    Eye,
    MessageSquare,
    Star,
    Banknote,
    CheckCircle2,
  } from 'lucide-svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  let acceptingId = $state<string | null>(null)

  function formatMoney(cents: number, currency = 'UAH') {
    return new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(cents / 100)
  }

  function formatBudget(
    min: number | null,
    max: number | null,
    currency = 'UAH',
  ) {
    if (min && max)
      return `${formatMoney(min, currency)} — ${formatMoney(max, currency)}`
    if (max) return `до ${formatMoney(max, currency)}`
    if (min) return `від ${formatMoney(min, currency)}`
    return 'Бюджет договірний'
  }

  function formatRelative(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const min = Math.floor(diff / 60_000)
    const hr = Math.floor(min / 60)
    const days = Math.floor(hr / 24)
    if (min < 1) return 'щойно'
    if (min < 60) return `${min} хв тому`
    if (hr < 24) return `${hr} год тому`
    if (days < 7) return `${days} дн тому`
    return new Date(iso).toLocaleDateString('uk-UA', {
      day: 'numeric',
      month: 'short',
    })
  }

  function expiresIn(iso: string) {
    const diff = new Date(iso).getTime() - Date.now()
    if (diff <= 0) return 'Прострочено'
    const days = Math.floor(diff / (24 * 60 * 60_000))
    const hr = Math.floor(diff / (60 * 60_000))
    if (days >= 1) return `Активна ще ${days} дн`
    if (hr >= 1) return `Активна ще ${hr} год`
    return 'Активна < 1 год'
  }

  function memberSince(iso: string) {
    return new Date(iso).toLocaleDateString('uk-UA', {
      month: 'short',
      year: 'numeric',
    })
  }

  function initials(name: string | null) {
    return (name ?? '?')[0]?.toUpperCase() ?? '?'
  }

  function statusLabel(s: string) {
    return (
      (
        {
          OPEN: 'Відкрита',
          IN_PROGRESS: 'У роботі',
          COMPLETED: 'Завершена',
          CANCELLED: 'Скасована',
          EXPIRED: 'Прострочена',
        } as Record<string, string>
      )[s] ?? s
    )
  }

  function proposalStatusLabel(s: string) {
    return (
      (
        {
          SENT: 'Очікує',
          ACCEPTED: 'Прийнято',
          REJECTED: 'Відхилено',
          WITHDRAWN: 'Відкликано',
        } as Record<string, string>
      )[s] ?? s
    )
  }

  async function acceptProposal(proposalId: string) {
    if (acceptingId) return
    if (!confirm('Прийняти цю пропозицію? Інші відгуки будуть відхилені.'))
      return
    acceptingId = proposalId
    try {
      const res = await fetch(`/api/proposals/${proposalId}/accept`, {
        method: 'POST',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json?.message ?? json?.error ?? 'Не вдалось прийняти')
        return
      }
      if (json.orderId) goto(`/orders/${json.orderId}`, { invalidateAll: true })
      else location.reload()
    } catch {
      alert('Помилка зʼєднання')
    } finally {
      acceptingId = null
    }
  }
</script>

<div class="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
  <button
    type="button"
    onclick={() => goto('/jobs')}
    class="inline-flex items-center gap-1.5 text-sm mb-5 cursor-pointer hover:opacity-70 transition-opacity"
    style="color: var(--muted-foreground)"
  >
    <ArrowLeft class="size-4" /> До списку
  </button>

  <!-- Header card -->
  <div
    class="rounded-2xl p-5 sm:p-6 mb-4"
    style="background-color: var(--card); border: 1px solid var(--border)"
  >
    <div class="flex items-center gap-2 flex-wrap mb-3">
      <Badge variant="outline" class="text-[10px] font-bold uppercase">
        {statusLabel(data.job.status)}
      </Badge>
      <span class="text-xs" style="color: var(--muted-foreground)"
        >{formatRelative(data.job.createdAt)}</span
      >
      {#if data.job.status === 'OPEN'}
        <span class="text-xs" style="color: var(--muted-foreground)"
          >· {expiresIn(data.job.expiresAt)}</span
        >
      {/if}
    </div>

    <h1
      class="text-xl sm:text-2xl font-bold tracking-tight mb-3"
      style="color: var(--foreground); letter-spacing: -0.02em"
    >
      {data.job.title}
    </h1>

    <div class="flex items-center gap-3 flex-wrap text-sm mb-5">
      <span
        class="inline-flex items-center gap-1.5"
        style="color: var(--muted-foreground)"
      >
        <Layers class="size-3.5" />{data.job.category}
      </span>
      <span
        class="inline-flex items-center gap-1.5"
        style="color: var(--muted-foreground)"
      >
        <MapPin class="size-3.5" />{data.job.city}
      </span>
      <span
        class="inline-flex items-center gap-1.5 font-semibold tabular-nums"
        style="color: var(--foreground)"
      >
        <Banknote class="size-3.5" />
        {formatBudget(
          data.job.budgetMinCents,
          data.job.budgetMaxCents,
          data.job.currency,
        )}
      </span>
    </div>

    <div
      class="text-sm leading-relaxed whitespace-pre-wrap mb-5"
      style="color: var(--foreground)"
    >
      {data.job.description}
    </div>

    <div
      class="flex items-center gap-4 pt-4 text-xs"
      style="border-top: 1px solid var(--border); color: var(--muted-foreground)"
    >
      <span class="inline-flex items-center gap-1"
        ><Eye class="size-3.5" />{data.job.viewsCount} переглядів</span
      >
      <span class="inline-flex items-center gap-1"
        ><MessageSquare class="size-3.5" />{data.job.proposalsCount} пропозицій</span
      >
    </div>
  </div>

  <!-- Client card -->
  <div
    class="rounded-2xl p-4 sm:p-5 mb-4"
    style="background-color: var(--card); border: 1px solid var(--border)"
  >
    <p
      class="text-[11px] font-semibold uppercase tracking-widest mb-3"
      style="color: var(--muted-foreground)"
    >
      Замовник
    </p>
    <a
      href={data.job.client.username ? `/@${data.job.client.username}` : '#'}
      class="flex items-center gap-3 group"
    >
      <Avatar class="size-12">
        <AvatarImage
          src={data.job.client.avatar ?? ''}
          alt={data.job.client.name ?? ''}
        />
        <AvatarFallback class="text-base font-semibold"
          >{initials(data.job.client.name)}</AvatarFallback
        >
      </Avatar>
      <div class="min-w-0 flex-1">
        <p
          class="text-sm font-semibold group-hover:underline"
          style="color: var(--foreground)"
        >
          {data.job.client.name ?? 'Користувач'}
        </p>
        <div
          class="flex items-center gap-2 text-xs mt-0.5"
          style="color: var(--muted-foreground)"
        >
          {#if data.job.client.reviewsCount > 0}
            <span class="inline-flex items-center gap-1">
              <Star class="size-3" style="color: #f5a623; fill: #f5a623" />
              {data.job.client.avgRating.toFixed(1)} ({data.job.client
                .reviewsCount})
            </span>
            <span>·</span>
          {/if}
          <span>З {memberSince(data.job.client.createdAt)}</span>
        </div>
      </div>
    </a>
  </div>

  <!-- Proposals -->
  {#if data.proposals.length > 0}
    <div
      class="rounded-2xl p-5"
      style="background-color: var(--card); border: 1px solid var(--border)"
    >
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-sm font-semibold" style="color: var(--foreground)">
          Пропозиції майстрів
        </h2>
        <span class="text-xs" style="color: var(--muted-foreground)"
          >{data.proposals.length}</span
        >
      </div>
      <div class="space-y-3">
        {#each data.proposals as p (p.id)}
          <div
            class="rounded-xl p-4"
            style="background-color: var(--background); border: 1px solid var(--border)"
          >
            <div class="flex items-start justify-between gap-3 mb-3">
              <a
                href={p.master.username ? `/@${p.master.username}` : '#'}
                class="flex items-center gap-2.5 min-w-0 group"
              >
                <Avatar class="size-9 shrink-0">
                  <AvatarImage
                    src={p.master.avatar ?? ''}
                    alt={p.master.name ?? ''}
                  />
                  <AvatarFallback class="text-sm font-semibold"
                    >{initials(p.master.name)}</AvatarFallback
                  >
                </Avatar>
                <div class="min-w-0">
                  <p
                    class="text-sm font-semibold group-hover:underline truncate"
                    style="color: var(--foreground)"
                  >
                    {p.master.name ?? 'Майстер'}
                  </p>
                  {#if p.master.reviewsCount > 0}
                    <p
                      class="text-[11px] inline-flex items-center gap-1 mt-0.5"
                      style="color: var(--muted-foreground)"
                    >
                      <Star
                        class="size-3"
                        style="color: #f5a623; fill: #f5a623"
                      />
                      {p.master.avgRating.toFixed(1)} ({p.master.reviewsCount})
                    </p>
                  {/if}
                </div>
              </a>
              <Badge variant="outline" class="text-[10px] uppercase"
                >{proposalStatusLabel(p.status)}</Badge
              >
            </div>

            <p
              class="text-sm leading-relaxed mb-3 whitespace-pre-wrap"
              style="color: var(--foreground)"
            >
              {p.message}
            </p>

            <div
              class="flex items-center justify-between gap-3 pt-3"
              style="border-top: 1px solid var(--border)"
            >
              <div
                class="flex items-center gap-3 text-xs"
                style="color: var(--muted-foreground)"
              >
                <span class="inline-flex items-center gap-1"
                  ><Clock class="size-3" />{p.estimatedDays} дн</span
                >
                <span
                  class="font-semibold tabular-nums"
                  style="color: var(--foreground)"
                  >{formatMoney(p.priceCents, data.job.currency)}</span
                >
              </div>
              {#if p.status === 'SENT' && data.job.status === 'OPEN'}
                <Button
                  size="sm"
                  disabled={acceptingId !== null}
                  onclick={() => acceptProposal(p.id)}
                  class="gap-1.5"
                >
                  {#if acceptingId === p.id}
                    Приймаємо…
                  {:else}
                    <CheckCircle2 class="size-3.5" /> Прийняти
                  {/if}
                </Button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else if data.job.status === 'OPEN'}
    <div
      class="rounded-2xl p-8 text-center"
      style="background-color: var(--card); border: 1px solid var(--border)"
    >
      <div
        class="size-12 rounded-full mx-auto mb-3 flex items-center justify-center"
        style="background-color: var(--muted)"
      >
        <Clock
          class="size-5"
          style="color: var(--muted-foreground)"
          strokeWidth={1.75}
        />
      </div>
      <p class="text-sm font-semibold mb-1" style="color: var(--foreground)">
        Очікуємо пропозиції
      </p>
      <p
        class="text-xs leading-relaxed max-w-xs mx-auto"
        style="color: var(--muted-foreground)"
      >
        Майстри вашого міста отримали повідомлення про заявку. Перші пропозиції
        зазвичай зʼявляються протягом години.
      </p>
    </div>
  {/if}
</div>
