<!-- src/routes/(auth)/jobs/[id]/job-client-view.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Card, CardContent } from '$lib/components/ui/card'
  import { Separator } from '$lib/components/ui/separator'
  import {
    ArrowLeft,
    MapPin,
    Layers,
    Clock,
    Eye,
    MessageSquare,
    Star,
    Wallet,
    CheckCircle2,
  } from 'lucide-svelte'
  import type { PageData } from './$types'
  import { Spinner } from '$lib/components/ui/spinner'

  let { data }: { data: PageData } = $props()
  let acceptingId = $state<string | null>(null)

  function formatMoney(cents: number, currency = 'UAH') {
    return new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(cents / 100)
  }
  function formatBudget(min: number | null, max: number | null, c = 'UAH') {
    if (min && max) return `${formatMoney(min, c)} — ${formatMoney(max, c)}`
    if (max) return `до ${formatMoney(max, c)}`
    if (min) return `від ${formatMoney(min, c)}`
    return 'Договірний'
  }
  function formatRelative(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const min = Math.floor(diff / 60_000)
    const hr = Math.floor(min / 60)
    const days = Math.floor(hr / 24)
    if (min < 1) return 'щойно'
    if (min < 60) return `${min} хв тому`
    if (hr < 24) return `${hr} год тому`
    if (days < 7) return `${days} дн`
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
    if (days >= 1) return `${days} дн`
    if (hr >= 1) return `${hr} год`
    return '< 1 год'
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
  function statusVariant(s: string): 'default' | 'secondary' | 'outline' {
    if (s === 'OPEN') return 'default'
    if (s === 'IN_PROGRESS') return 'secondary'
    return 'outline'
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
  function proposalStatusVariant(
    s: string,
  ): 'default' | 'secondary' | 'outline' {
    if (s === 'ACCEPTED') return 'default'
    if (s === 'SENT') return 'secondary'
    return 'outline'
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
        alert(json?.message ?? 'Не вдалось прийняти')
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

<!-- Back -->
<button
  type="button"
  onclick={() => goto('/jobs')}
  class="inline-flex items-center gap-1.5 text-sm mb-5 cursor-pointer hover:opacity-70 transition-opacity"
  style="color: var(--muted-foreground)"
>
  <ArrowLeft class="size-4" /> До моїх заявок
</button>

<!-- Header card -->
<Card class="rounded-2xl mb-3">
  <CardContent class="p-5 sm:p-6">
    <div class="flex items-center gap-2 flex-wrap mb-3">
      <Badge
        variant={statusVariant(data.job.status)}
        class="text-[10px] uppercase font-bold"
      >
        {statusLabel(data.job.status)}
      </Badge>
      <span class="text-xs" style="color: var(--muted-foreground)">
        {formatRelative(data.job.createdAt)}
      </span>
      {#if data.job.status === 'OPEN'}
        <span class="text-xs" style="color: var(--muted-foreground)">
          · Активна ще {expiresIn(data.job.expiresAt)}
        </span>
      {/if}
    </div>

    <h1
      class="text-xl sm:text-2xl font-bold tracking-tight mb-3"
      style="color: var(--foreground); letter-spacing: -0.02em"
    >
      {data.job.title}
    </h1>

    <p
      class="text-sm leading-relaxed whitespace-pre-wrap mb-4"
      style="color: var(--foreground)"
    >
      {data.job.description}
    </p>

    <div class="flex items-center gap-2 flex-wrap mb-4">
      <Badge variant="outline" class="font-normal gap-1 text-xs">
        <Layers class="size-3" />
        {data.job.category}
      </Badge>
      <Badge variant="outline" class="font-normal gap-1 text-xs">
        <MapPin class="size-3" />
        {data.job.city}
      </Badge>
      <Badge
        variant="secondary"
        class="font-semibold tabular-nums text-xs gap-1"
      >
        <Wallet class="size-3" />
        {formatBudget(
          data.job.budgetMinCents,
          data.job.budgetMaxCents,
          data.job.currency,
        )}
      </Badge>
    </div>

    <Separator class="my-4" />

    <div
      class="flex items-center gap-4 text-xs"
      style="color: var(--muted-foreground)"
    >
      <span class="inline-flex items-center gap-1">
        <MessageSquare class="size-3.5" />
        {data.job.proposalsCount} пропозиц{data.job.proposalsCount === 1
          ? 'ія'
          : 'ій'}
      </span>
      <span class="inline-flex items-center gap-1">
        <Eye class="size-3.5" />
        {data.job.viewsCount} переглядів
      </span>
    </div>
  </CardContent>
</Card>

<!-- Proposals -->
{#if data.proposals.length > 0}
  <div class="flex items-center justify-between mb-3 mt-6 px-1">
    <h2
      class="text-base font-bold tracking-tight"
      style="color: var(--foreground); letter-spacing: -0.01em"
    >
      Відгуки майстрів
    </h2>
    <span class="text-xs tabular-nums" style="color: var(--muted-foreground)">
      {data.proposals.length}
    </span>
  </div>

  <div class="space-y-3">
    {#each data.proposals as p (p.id)}
      <Card class="rounded-2xl transition-all hover:-translate-y-0.5">
        <CardContent class="p-5">
          <div class="flex items-start justify-between gap-3 mb-3">
            <a
              href={p.master.username ? `/@${p.master.username}` : '#'}
              class="flex items-center gap-2.5 min-w-0 group"
            >
              <Avatar class="size-10 shrink-0">
                <AvatarImage
                  src={p.master.avatar ?? ''}
                  alt={p.master.name ?? ''}
                />
                <AvatarFallback class="text-sm font-semibold">
                  {initials(p.master.name)}
                </AvatarFallback>
              </Avatar>
              <div class="min-w-0">
                <p
                  class="text-sm font-semibold group-hover:underline truncate"
                  style="color: var(--foreground)"
                >
                  {p.master.name ?? 'Майстер'}
                </p>
                <div
                  class="flex items-center gap-1.5 text-xs mt-0.5"
                  style="color: var(--muted-foreground)"
                >
                  {#if p.master.reviewsCount > 0}
                    <span class="inline-flex items-center gap-1">
                      <Star
                        class="size-3"
                        style="color: #f5a623; fill: #f5a623"
                      />
                      {p.master.avgRating.toFixed(1)} ({p.master.reviewsCount})
                    </span>
                    <span>·</span>
                  {/if}
                  <span>{formatRelative(p.createdAt)}</span>
                </div>
              </div>
            </a>
            <Badge
              variant={proposalStatusVariant(p.status)}
              class="text-[10px] uppercase shrink-0"
            >
              {proposalStatusLabel(p.status)}
            </Badge>
          </div>

          <p
            class="text-sm leading-relaxed mb-4 whitespace-pre-wrap"
            style="color: var(--foreground)"
          >
            {p.message}
          </p>

          <Separator class="mb-3" />

          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" class="font-normal gap-1 text-xs">
                <Clock class="size-3" />
                {p.estimatedDays} дн
              </Badge>
              <Badge
                variant="secondary"
                class="font-semibold tabular-nums text-xs gap-1"
              >
                <Wallet class="size-3" />
                {formatMoney(p.priceCents, data.job.currency)}
              </Badge>
            </div>
            {#if p.status === 'SENT' && data.job.status === 'OPEN'}
              <Button
                size="sm"
                disabled={acceptingId !== null}
                onclick={() => acceptProposal(p.id)}
                class="rounded-full gap-1.5"
              >
                {#if acceptingId === p.id}
                  <Spinner />
                  Приймаємо…
                {:else}
                  <CheckCircle2 class="size-3.5" /> Прийняти
                {/if}
              </Button>
            {/if}
          </div>
        </CardContent>
      </Card>
    {/each}
  </div>
{:else if data.job.status === 'OPEN'}
  <Card class="rounded-2xl">
    <CardContent class="px-6 py-12 text-center">
      <div
        class="size-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
        style="background-color: var(--muted)"
      >
        <Clock
          class="size-6"
          strokeWidth={1.75}
          style="color: var(--muted-foreground)"
        />
      </div>
      <h2 class="text-base font-semibold mb-1" style="color: var(--foreground)">
        Очікуємо пропозиції
      </h2>
      <p
        class="text-sm max-w-sm mx-auto"
        style="color: var(--muted-foreground)"
      >
        Майстри вашого міста отримали сповіщення. Перші відгуки зазвичай
        зʼявляються протягом години.
      </p>
    </CardContent>
  </Card>
{/if}
