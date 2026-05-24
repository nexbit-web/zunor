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
  import { describeJob } from '$lib/categories/cleaning/describe'
  import PhotoGallery from '$lib/components/photo-gallery.svelte'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'

  let { data }: { data: PageData } = $props()
  let acceptingId = $state<string | null>(null)
  let showAll = $state(false)

  let cancelling = $state(false)
  let cancelDialogOpen = $state(false)
  let acceptDialogOpen = $state(false)
  let pendingAcceptId = $state<string | null>(null)

  async function cancelJob() {
    if (cancelling) return
    cancelling = true
    try {
      const res = await fetch(`/api/jobs/${data.job.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json?.message ?? 'Не вдалось скасувати')
        return
      }
      goto('/jobs', { invalidateAll: true })
    } catch {
      alert('Помилка зʼєднання')
    } finally {
      cancelling = false
      cancelDialogOpen = false
    }
  }

  const details = $derived(describeJob(data.job.metadata))

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

    {#if data.job.description}
      <p
        class="text-sm leading-relaxed whitespace-pre-wrap mb-4"
        style="color: var(--foreground)"
      >
        {data.job.description}
      </p>
    {/if}

    <!-- Характеристики заявки -->
    {#if details.length > 0}
      <div class="rounded-xl border border-border overflow-hidden mb-4">
        {#each details as d, i (d.label)}
          {#if d.items}
            <div
              class="px-4 py-3 text-sm"
              class:border-t={i > 0}
              style="border-color: var(--border)"
            >
              <span class="block mb-2.5" style="color: var(--muted-foreground)"
                >{d.label}</span
              >
              <div class="space-y-2">
                {#each d.items as it (it.name)}
                  <div class="flex items-center justify-between gap-3">
                    <span class="font-medium" style="color: var(--foreground)"
                      >{it.name}</span
                    >
                    <span
                      class="shrink-0 inline-flex items-center justify-center min-w-7 h-6 px-2 rounded-full text-xs font-semibold tabular-nums"
                      style="background-color: var(--secondary); color: var(--foreground)"
                    >
                      ×{it.qty}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            <div
              class="flex items-center justify-between px-4 py-2.5 text-sm gap-4"
              class:border-t={i > 0}
              style="border-color: var(--border)"
            >
              <span class="shrink-0" style="color: var(--muted-foreground)"
                >{d.label}</span
              >
              <span
                class="font-medium text-right"
                style="color: var(--foreground)"
              >
                {d.value}
              </span>
            </div>
          {/if}
        {/each}
      </div>
    {/if}

    <!-- Фото обсягу робіт -->
    {#if data.job.attachments && data.job.attachments.length > 0}
      <div class="mb-4">
        <PhotoGallery images={data.job.attachments} />
      </div>
    {/if}

    <!-- Місто -->
    <div
      class="flex items-center gap-1.5 text-sm mb-4"
      style="color: var(--muted-foreground)"
    >
      <MapPin class="size-3.5" />
      {data.job.city}
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

    {#if data.job.status === 'OPEN'}
      <Separator class="my-4" />
      <button
        type="button"
        onclick={() => (cancelDialogOpen = true)}
        disabled={cancelling}
        class="inline-flex items-center gap-1.5 text-sm font-medium cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-50"
        style="color: var(--destructive)"
      >
        {#if cancelling}
          <Spinner /> Скасовуємо…
        {:else}
          Скасувати заявку
        {/if}
      </button>
    {/if}
  </CardContent>
</Card>

<!-- Proposals -->
{#if data.proposals.length > 0}
  {@const recommended = data.proposals.filter((p) => p.recommended)}
  {@const others = data.proposals.filter((p) => !p.recommended)}
  {@const visible = showAll ? data.proposals : recommended}

  <div class="flex items-center justify-between mb-3 mt-6 px-1">
    <h2
      class="text-base font-bold tracking-tight"
      style="color: var(--foreground); letter-spacing: -0.01em"
    >
      {#if recommended.length > 0 && !showAll}
        Рекомендуємо для вас
      {:else}
        Відгуки майстрів
      {/if}
    </h2>
    <span class="text-xs tabular-nums" style="color: var(--muted-foreground)">
      {data.proposals.length}
    </span>
  </div>

  <div class="space-y-3">
    {#each visible as p (p.id)}
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
            <div class="flex items-center gap-1.5 shrink-0">
              {#if p.recommended}
                <Badge variant="default" class="text-[10px] uppercase gap-1">
                  <Star class="size-3" style="fill: currentColor" />
                  Топ
                </Badge>
              {/if}
              {#if p.isNew}
                <Badge
                  variant="outline"
                  class="text-[10px] uppercase gap-1"
                  style="border-color: var(--brand); color: var(--brand)"
                >
                  Новачок
                </Badge>
              {/if}
              <Badge
                variant={proposalStatusVariant(p.status)}
                class="text-[10px] uppercase"
              >
                {proposalStatusLabel(p.status)}
              </Badge>
            </div>
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
                onclick={() => {
                  pendingAcceptId = p.id
                  acceptDialogOpen = true
                }}
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

  {#if !showAll && others.length > 0}
    <button
      type="button"
      onclick={() => (showAll = true)}
      class="w-full mt-3 py-3 rounded-2xl text-sm font-medium cursor-pointer transition-colors"
      style="color: var(--foreground); background-color: var(--secondary)"
    >
      Показати всі відгуки ({data.proposals.length})
    </button>
  {/if}
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

<!-- Модалка скасування заявки -->
<AlertDialog.Root bind:open={cancelDialogOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Скасувати заявку?</AlertDialog.Title>
      <AlertDialog.Description>
        Усі отримані відгуки буде відхилено. Цю дію не можна скасувати.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={cancelling}>Назад</AlertDialog.Cancel>
      <AlertDialog.Action
        onclick={cancelJob}
        disabled={cancelling}
        class="bg-destructive text-white hover:bg-destructive/90"
      >
        {cancelling ? 'Скасовуємо…' : 'Скасувати заявку'}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<!-- Модалка прийняття пропозиції -->
<AlertDialog.Root bind:open={acceptDialogOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Прийняти пропозицію?</AlertDialog.Title>
      <AlertDialog.Description>
        Інші відгуки буде відхилено, і відкриється чат з обраним клінером.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={acceptingId !== null}
        >Назад</AlertDialog.Cancel
      >
      <AlertDialog.Action
        onclick={() => {
          acceptDialogOpen = false
          if (pendingAcceptId) acceptProposal(pendingAcceptId)
        }}
        disabled={acceptingId !== null}
      >
        Прийняти
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
