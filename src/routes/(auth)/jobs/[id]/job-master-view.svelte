<!-- src/routes/(auth)/jobs/[id]/job-master-view.svelte -->
<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Card, CardContent } from '$lib/components/ui/card'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { Separator } from '$lib/components/ui/separator'
  import {
    ArrowLeft,
    MapPin,
    Layers,
    Clock,
    Eye,
    MessageSquare,
    Star,
    XCircle,
    Send,
    Wallet,
  } from 'lucide-svelte'
  import type { PageData } from './$types'
  import { Spinner } from '$lib/components/ui/spinner'

  let { data }: { data: PageData } = $props()

  // ─── Форма отклика ───
  let formOpen = $state(false)
  let message = $state('')
  let priceUah = $state<number | ''>('')
  let estimatedDays = $state<number | ''>('')
  let submitting = $state(false)
  let errorMsg = $state<string | null>(null)

  const messageLen = $derived(message.trim().length)
  const canSubmit = $derived(
    !submitting &&
      messageLen >= 20 &&
      messageLen <= 2000 &&
      typeof priceUah === 'number' &&
      priceUah >= 50 &&
      priceUah <= 500_000 &&
      typeof estimatedDays === 'number' &&
      estimatedDays >= 1 &&
      estimatedDays <= 180,
  )

  async function submitProposal() {
    if (!canSubmit) return
    submitting = true
    errorMsg = null
    try {
      const res = await fetch(`/api/jobs/${data.job.id}/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, priceUah, estimatedDays }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        errorMsg = json?.message ?? json?.error ?? 'Не вдалось відправити'
        return
      }
      formOpen = false
      message = ''
      priceUah = ''
      estimatedDays = ''
      await invalidateAll()
    } catch {
      errorMsg = 'Помилка зʼєднання'
    } finally {
      submitting = false
    }
  }

  // ─── Хелперы ───
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
</script>

<!-- Back -->
<button
  type="button"
  onclick={() => goto('/jobs')}
  class="inline-flex items-center gap-1.5 text-sm mb-5 cursor-pointer hover:opacity-70 transition-opacity"
  style="color: var(--muted-foreground)"
>
  <ArrowLeft class="size-4" /> До списку
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
        {data.job.viewsCount}
      </span>
    </div>
  </CardContent>
</Card>

<!-- Client card -->
<Card class="rounded-2xl mb-3">
  <CardContent class="p-4 sm:p-5">
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
      <Avatar class="size-11">
        <AvatarImage
          src={data.job.client.avatar ?? ''}
          alt={data.job.client.name ?? ''}
        />
        <AvatarFallback class="text-base font-semibold">
          {initials(data.job.client.name)}
        </AvatarFallback>
      </Avatar>
      <div class="min-w-0 flex-1">
        <p
          class="text-sm font-semibold group-hover:underline"
          style="color: var(--foreground)"
        >
          {data.job.client.name ?? 'Замовник'}
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
  </CardContent>
</Card>

<!-- Action area -->
{#if data.proposals.length > 0}
  <!-- Уже есть отклик -->
  {#each data.proposals as p (p.id)}
    <Card class="rounded-2xl mb-3">
      <CardContent class="p-5">
        <div class="flex items-center justify-between mb-3">
          <p
            class="text-[11px] font-semibold uppercase tracking-widest"
            style="color: var(--muted-foreground)"
          >
            Ваша пропозиція
          </p>
          <Badge
            variant={proposalStatusVariant(p.status)}
            class="text-[10px] uppercase"
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

        <Separator class="my-3" />

        <div
          class="flex items-center gap-3 text-xs"
          style="color: var(--muted-foreground)"
        >
          <span class="inline-flex items-center gap-1">
            <Clock class="size-3.5" />
            {p.estimatedDays} дн
          </span>
          <span>·</span>
          <span
            class="font-semibold tabular-nums"
            style="color: var(--foreground)"
          >
            {formatMoney(p.priceCents, data.job.currency)}
          </span>
          <span class="ml-auto">{formatRelative(p.createdAt)}</span>
        </div>
      </CardContent>
    </Card>
  {/each}
{:else if data.canPropose}
  <Card class="rounded-2xl">
    <CardContent class="p-5">
      {#if !formOpen}
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="min-w-0">
            <p class="text-sm font-semibold" style="color: var(--foreground)">
              Подати пропозицію
            </p>
            <p class="text-xs mt-0.5" style="color: var(--muted-foreground)">
              Запропонуйте ціну та термін — клієнт отримає сповіщення
            </p>
          </div>
          <Button
            onclick={() => (formOpen = true)}
            class="rounded-full gap-2 shrink-0"
          >
            <Send class="size-4" /> Запропонувати
          </Button>
        </div>
      {:else}
        <div class="space-y-4">
          <div>
            <div class="flex items-center justify-between mb-2">
              <Label for="proposal-msg" class="text-sm font-semibold">
                Повідомлення клієнту
              </Label>
              <span
                class="text-[11px] tabular-nums"
                style="color: {messageLen < 20 || messageLen > 2000
                  ? 'var(--destructive)'
                  : 'var(--muted-foreground)'}"
              >
                {messageLen} / 2000
              </span>
            </div>
            <Textarea
              id="proposal-msg"
              bind:value={message}
              rows={4}
              placeholder="Розкажіть, як ви виконаєте роботу. Мінімум 20 символів."
              class="resize-none"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <Label
                for="proposal-price"
                class="text-sm font-semibold mb-2 block"
              >
                Ціна, грн
              </Label>
              <Input
                id="proposal-price"
                type="number"
                bind:value={priceUah}
                min={50}
                max={500000}
                placeholder="2000"
                class="tabular-nums"
              />
            </div>
            <div>
              <Label
                for="proposal-days"
                class="text-sm font-semibold mb-2 block"
              >
                Термін, днів
              </Label>
              <Input
                id="proposal-days"
                type="number"
                bind:value={estimatedDays}
                min={1}
                max={180}
                placeholder="3"
                class="tabular-nums"
              />
            </div>
          </div>

          {#if errorMsg}
            <div
              class="text-xs flex items-start gap-2 rounded-lg px-3 py-2.5"
              style="background-color: color-mix(in srgb, var(--destructive) 10%, transparent); color: var(--destructive)"
            >
              <XCircle class="size-3.5 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          {/if}

          <div class="flex items-center gap-2 pt-1">
            <Button
              variant="ghost"
              onclick={() => {
                formOpen = false
                errorMsg = null
              }}
              disabled={submitting}
            >
              Скасувати
            </Button>
            <Button
              onclick={submitProposal}
              disabled={!canSubmit}
              class="flex-1 rounded-full gap-2"
            >
              {#if submitting}
                <Spinner />
                Відправляємо…
              {:else}
                <Send class="size-3.5" /> Відправити відгук
              {/if}
            </Button>
          </div>
        </div>
      {/if}
    </CardContent>
  </Card>
{:else if data.cantProposeReason}
  <Card class="rounded-2xl" style="background-color: var(--muted)">
    <CardContent class="p-4 text-sm flex items-start gap-2.5">
      <XCircle
        class="size-4 shrink-0 mt-0.5"
        style="color: var(--muted-foreground)"
      />
      <span style="color: var(--muted-foreground)"
        >{data.cantProposeReason}</span
      >
    </CardContent>
  </Card>
{/if}
