<!-- src/lib/components/jobs/job-card.svelte -->
<script lang="ts">
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Users, Clock, ArrowRight, MapPin, Tag } from 'lucide-svelte'
  import { formatBudget } from '$lib/orders/labels'

  interface Props {
    job: {
      id: string
      title: string
      description: string
      category: string
      budgetMinCents: number | null
      budgetMaxCents: number | null
      currency: string
      city: string | null
      proposalsCount: number
      createdAt: string
      expiresAt: string
      client?: {
        id: string
        name: string | null
        username: string | null
        avatar: string | null
      }
    }
    showClient?: boolean
    statusBadge?: string | null
  }

  let { job, showClient = true, statusBadge = null }: Props = $props()

  const relativeTime = $derived.by(() => {
    const date = new Date(job.createdAt)
    const diffMs = Date.now() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHr = Math.floor(diffMin / 60)
    const diffDays = Math.floor(diffHr / 24)

    if (diffMin < 1) return 'щойно'
    if (diffMin < 60) return `${diffMin} хв тому`
    if (diffHr < 24) return `${diffHr} год тому`
    if (diffDays < 7)
      return `${diffDays} ${diffDays === 1 ? 'день' : 'днів'} тому`
    return date.toLocaleDateString('uk-UA', {
      day: 'numeric',
      month: 'short',
    })
  })

  const clientInitial = $derived(job.client?.name?.[0]?.toUpperCase() ?? '?')
</script>

<a href={`/jobs/${job.id}`} class="ios-card-link group block">
  <!-- ━━━ Top zone (white) — content ━━━ -->
  <div class="px-5 pt-5 pb-4">
    <!-- Title + budget -->
    <div class="flex items-start justify-between gap-4 mb-2.5">
      <h3
        class="text-[15.5px] sm:text-base font-semibold leading-snug line-clamp-2 flex-1 tracking-[-0.01em]"
        style="color: var(--foreground)"
      >
        {job.title}
      </h3>
      <div class="text-right shrink-0">
        <span class="text-sm font-semibold" style="color: var(--foreground)">
          {formatBudget(job.budgetMinCents, job.budgetMaxCents, job.currency)}
        </span>
        <p
          class="text-[10px] uppercase tracking-[0.06em] mt-0.5 font-medium"
          style="color: var(--muted-foreground)"
        >
          бюджет
        </p>
      </div>
    </div>

    <!-- Description -->
    <p
      class="text-[13.5px] leading-[1.55] line-clamp-2 mb-3.5"
      style="color: var(--muted-foreground)"
    >
      {job.description}
    </p>

    <!-- Category badge -->
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="ios-tag ios-tag-primary">
        <Tag class="size-3 opacity-70" strokeWidth={2} />
        {job.category}
      </span>
      {#if job.city}
        <span class="ios-tag">
          <MapPin class="size-3 opacity-70" strokeWidth={2} />
          {job.city}
        </span>
      {/if}
    </div>
  </div>

  <!-- ━━━ Bottom zone (gray) — meta + arrow ━━━ -->
  <div
    class="ios-card-footer flex items-center justify-between gap-3 px-5 py-3"
  >
    <div class="flex items-center gap-2.5 min-w-0 flex-1">
      {#if showClient && job.client}
        <Avatar class="size-7 shrink-0">
          <AvatarImage
            src={job.client.avatar ?? ''}
            alt={job.client.name ?? ''}
          />
          <AvatarFallback class="text-[11px] font-semibold ios-avatar-fallback">
            {clientInitial}
          </AvatarFallback>
        </Avatar>
        <span
          class="text-[12.5px] font-medium truncate max-w-[140px]"
          style="color: var(--foreground)"
        >
          {job.client.name}
        </span>
        <span class="ios-meta-divider"></span>
      {/if}

      <div
        class="flex items-center gap-2.5 text-[11.5px] min-w-0 overflow-hidden"
        style="color: var(--muted-foreground)"
      >
        <span class="inline-flex items-center gap-1 shrink-0 tabular-nums">
          <Users class="size-3" strokeWidth={2} />
          {job.proposalsCount}
        </span>

        <span class="ios-meta-divider hidden sm:inline-block"></span>
        <span class="hidden sm:inline-flex items-center gap-1 shrink-0">
          <Clock class="size-3" strokeWidth={2} />
          {relativeTime}
        </span>
      </div>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      {#if statusBadge}
        <span class="ios-status-badge">{statusBadge}</span>
      {/if}
      <span class="ios-arrow-circle">
        <ArrowRight class="size-3.5" strokeWidth={2.5} />
      </span>
    </div>
  </div>
</a>

<style>
  /* ─── Card ─── */
  :global(.ios-card-link) {
    background-color: var(--card, #ffffff);
    border-radius: 16px;
    border: 1px solid rgba(0, 0, 0, 0.14);
    overflow: hidden;
    transition:
      border-color 180ms ease,
      box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1),
      transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
    text-decoration: none;
    color: inherit;
    display: block;
    will-change: transform;
  }
  :global(.ios-card-link:hover) {
    border-color: rgba(0, 0, 0, 0.24);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  }
  :global(.ios-card-link:active) {
    transform: scale(0.997);
  }

  @media (prefers-color-scheme: dark) {
    :global(.ios-card-link) {
      border-color: rgba(255, 255, 255, 0.12);
    }
    :global(.ios-card-link:hover) {
      border-color: rgba(255, 255, 255, 0.22);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    }
  }

  /* ─── Footer (gray zone) ─── */
  :global(.ios-card-footer) {
    background-color: #f5f5f7;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
  }
  @media (prefers-color-scheme: dark) {
    :global(.ios-card-footer) {
      background-color: color-mix(in srgb, var(--muted) 60%, transparent);
      border-top-color: rgba(255, 255, 255, 0.08);
    }
  }

  /* ─── Avatar fallback ─── */
  :global(.ios-avatar-fallback) {
    background-color: rgba(255, 255, 255, 0.85);
    color: var(--foreground);
  }
  @media (prefers-color-scheme: dark) {
    :global(.ios-avatar-fallback) {
      background-color: rgba(255, 255, 255, 0.08);
    }
  }

  /* ─── Tags ─── */
  :global(.ios-tag) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 8px;
    font-size: 11.5px;
    font-weight: 500;
    background-color: rgba(0, 0, 0, 0.05);
    color: var(--muted-foreground);
    line-height: 1.2;
    white-space: nowrap;
  }
  :global(.ios-tag-primary) {
    background-color: rgba(0, 122, 255, 0.1);
    color: #007aff;
    font-weight: 600;
  }
  @media (prefers-color-scheme: dark) {
    :global(.ios-tag) {
      background-color: rgba(255, 255, 255, 0.06);
    }
    :global(.ios-tag-primary) {
      background-color: rgba(0, 122, 255, 0.18);
      color: #5ea7ff;
    }
  }

  /* ─── Meta divider ─── */
  :global(.ios-meta-divider) {
    width: 2px;
    height: 2px;
    border-radius: 50%;
    background-color: currentColor;
    opacity: 0.4;
    flex-shrink: 0;
    display: inline-block;
  }

  /* ─── Status badge ─── */
  :global(.ios-status-badge) {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 9px;
    border-radius: 11px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background-color: #111111;
    color: #ffffff;
    white-space: nowrap;
  }

  /* ─── Arrow circle ─── */
  :global(.ios-arrow-circle) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: rgba(0, 0, 0, 0.06);
    color: var(--muted-foreground);
    transition:
      background-color 150ms ease,
      transform 200ms cubic-bezier(0.4, 0, 0.2, 1),
      color 150ms ease;
    flex-shrink: 0;
  }
  :global(.group:hover .ios-arrow-circle) {
    background-color: #111111;
    color: #ffffff;
    transform: translateX(2px);
  }
  @media (prefers-color-scheme: dark) {
    :global(.ios-arrow-circle) {
      background-color: rgba(255, 255, 255, 0.07);
    }
    :global(.group:hover .ios-arrow-circle) {
      background-color: #ffffff;
      color: #111111;
    }
  }
</style>
