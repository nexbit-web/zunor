<!-- src/lib/components/jobs/proposal-card.svelte -->
<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import {
    BadgeCheck,
    Star,
    Clock,
    MessageSquare,
    Loader2,
  } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'

  interface Props {
    proposal: {
      id: string
      coverLetter: string
      proposedPriceCents: number
      proposedDays: number
      status: string
      createdAt: string
      freelancer: {
        id: string
        name: string | null
        username: string | null
        avatar: string | null
        verificationStatus: string
        freelancerProfile: {
          avgRating: number
          reviewsCount: number
          completedOrders: number
          hourlyRate: number | null
          experience: string | null
          languages: string[]
        } | null
      }
    }
    /** Если true — показываем кнопку "Обрати" (для клиента-владельца) */
    canSelect?: boolean
    /** Job уже не OPEN */
    jobClosed?: boolean
  }

  let { proposal, canSelect = false, jobClosed = false }: Props = $props()

  let acceptLoading = $state(false)
  let actionError = $state('')

  function formatMoney(cents: number): string {
    return new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency: 'UAH',
      minimumFractionDigits: 0,
    }).format(cents / 100)
  }

  function formatRelative(iso: string): string {
    const date = new Date(iso)
    const diffMs = Date.now() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHr = Math.floor(diffMin / 60)
    const diffDays = Math.floor(diffHr / 24)
    if (diffMin < 1) return 'щойно'
    if (diffMin < 60) return `${diffMin} хв тому`
    if (diffHr < 24) return `${diffHr} год тому`
    return `${diffDays} ${diffDays === 1 ? 'день' : 'днів'} тому`
  }

  const fp = $derived(proposal.freelancer.freelancerProfile)
  const isAccepted = $derived(proposal.status === 'ACCEPTED')
  const isRejected = $derived(proposal.status === 'REJECTED')
  const isWithdrawn = $derived(proposal.status === 'WITHDRAWN')

  async function accept() {
    if (acceptLoading) return
    if (!confirm('Обрати цього фрілансера? Інші відгуки будуть відхилені.'))
      return

    acceptLoading = true
    actionError = ''
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/accept`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message ?? 'Помилка')
      }
      const { order } = await res.json()
      // Перейдем у замовлення (буде створено у Підзаході 4.4)
      // Поки — у чат
      if (order.chatId) {
        goto(`/messages/${order.chatId}`)
      } else {
        await invalidateAll()
      }
    } catch (err) {
      actionError = err instanceof Error ? err.message : 'Помилка'
    } finally {
      acceptLoading = false
    }
  }
</script>

<div
  class="rounded-xl p-4"
  style="background-color: var(--card);
         border: 1px solid {isAccepted ? 'var(--primary)' : 'var(--border)'};
         opacity: {isRejected || isWithdrawn ? 0.55 : 1}"
>
  <!-- Header: avatar + name + price -->
  <div class="flex items-start justify-between gap-3 mb-3">
    <a
      href={proposal.freelancer.username
        ? `/@${proposal.freelancer.username}`
        : '#'}
      class="flex items-start gap-2.5 min-w-0 group"
    >
      <Avatar class="size-10 shrink-0">
        <AvatarImage
          src={proposal.freelancer.avatar ?? ''}
          alt={proposal.freelancer.name ?? ''}
        />
        <AvatarFallback
          class="text-xs font-semibold"
          style="background-color: var(--muted); color: var(--foreground)"
        >
          {proposal.freelancer.name?.[0]?.toUpperCase() ?? '?'}
        </AvatarFallback>
      </Avatar>
      <div class="min-w-0">
        <div class="flex items-center gap-1">
          <span
            class="text-sm font-semibold truncate group-hover:underline"
            style="color: var(--foreground)"
          >
            {proposal.freelancer.name}
          </span>
          {#if proposal.freelancer.verificationStatus === 'VERIFIED'}
            <BadgeCheck
              class="size-3.5 shrink-0"
              style="color: var(--primary); fill: var(--primary); stroke: var(--primary-foreground)"
            />
          {/if}
        </div>
        {#if fp}
          <div
            class="flex items-center gap-2 text-[11px] mt-0.5"
            style="color: var(--muted-foreground)"
          >
            {#if fp.reviewsCount > 0}
              <span class="inline-flex items-center gap-0.5">
                <Star class="size-3" style="fill: currentColor" />
                {fp.avgRating.toFixed(1)} ({fp.reviewsCount})
              </span>
            {/if}
            {#if fp.completedOrders > 0}
              <span>{fp.completedOrders} замовлень</span>
            {/if}
          </div>
        {/if}
      </div>
    </a>

    <div class="text-right shrink-0">
      <p
        class="text-base font-bold tabular-nums"
        style="color: var(--foreground)"
      >
        {formatMoney(proposal.proposedPriceCents)}
      </p>
      <p
        class="text-[11px] inline-flex items-center gap-1 justify-end"
        style="color: var(--muted-foreground)"
      >
        <Clock class="size-3" />
        {proposal.proposedDays}
        {proposal.proposedDays === 1 ? 'день' : 'днів'}
      </p>
    </div>
  </div>

  <!-- Cover letter -->
  <p
    class="text-[13.5px] leading-relaxed whitespace-pre-wrap mb-3"
    style="color: var(--foreground)"
  >
    {proposal.coverLetter}
  </p>

  <!-- Footer -->
  <div
    class="flex items-center justify-between gap-2 pt-3"
    style="border-top: 1px solid var(--border)"
  >
    <span class="text-[11px]" style="color: var(--muted-foreground)">
      {formatRelative(proposal.createdAt)}
    </span>

    {#if isAccepted}
      <span
        class="text-[10px] font-bold uppercase px-2 py-0.5 rounded"
        style="background-color: var(--primary); color: var(--primary-foreground)"
      >
        Обрано
      </span>
    {:else if isRejected}
      <span class="text-[10px]" style="color: var(--muted-foreground)">
        Не обрано
      </span>
    {:else if isWithdrawn}
      <span class="text-[10px]" style="color: var(--muted-foreground)">
        Відкликано
      </span>
    {:else if canSelect && !jobClosed}
      <Button onclick={accept} disabled={acceptLoading} size="sm">
        {#if acceptLoading}
          <Loader2 class="size-3.5 mr-1 animate-spin" />
        {/if}
        Обрати
      </Button>
    {/if}
  </div>

  {#if actionError}
    <p class="text-[11px] mt-2" style="color: var(--destructive)">
      {actionError}
    </p>
  {/if}
</div>
