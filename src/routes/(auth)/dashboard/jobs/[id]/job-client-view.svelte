<!-- src/routes/(auth)/jobs/[id]/job-client-view.svelte -->
<!--
  Заявка очима клієнта + пропозиції майстрів — на токенах теми.
  Логіка 1:1: describeJob, cancelJob / acceptProposal (з модалками), showAll
  (recommended vs others), статуси/бейджі, Zuna waiting, форматтери.
  Усе клієнтське — UX; сервер валідує власність і права повторно.
-->
<script lang="ts">
  import { goto } from '$app/navigation'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Spinner } from '$lib/components/ui/spinner'
  import {
    ArrowLeft,
    MapPin,
    Clock,
    Eye,
    MessageSquare,
    Star,
    Wallet,
    CheckCircle2,
  } from 'lucide-svelte'
  import { describeJob } from '$lib/categories/cleaning/describe'
  import PhotoGallery from '$lib/components/photo-gallery.svelte'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import Zuna from '$lib/components/zuna.svelte'
  import toast from 'svelte-hot-french-toast'
  import {
    formatMoney,
    formatRelative,
    expiresIn,
    initials,
    statusLabel,
    proposalStatusLabel,
  } from '$lib/components/jobs/display'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
  let acceptingId = $state<string | null>(null)
  let showAll = $state(false)

  let cancelling = $state(false)
  let cancelDialogOpen = $state(false)
  let acceptDialogOpen = $state(false)
  let pendingAcceptId = $state<string | null>(null)

  const details = $derived(describeJob(data.job.metadata))

  // статуси → семантичні кольори (emerald/amber — статус, не акцент бренду)
  function statusBadge(status: string): string {
    if (status === 'OPEN') return 'bg-emerald-500/10 text-emerald-600'
    if (status === 'IN_PROGRESS') return 'bg-amber-500/10 text-amber-700'
    return 'bg-muted text-foreground'
  }
  function proposalBadge(status: string): string {
    if (status === 'ACCEPTED') return 'bg-emerald-500/10 text-emerald-600'
    if (status === 'REJECTED') return 'bg-destructive/10 text-destructive'
    return 'bg-amber-500/10 text-amber-700'
  }

  async function cancelJob() {
    if (cancelling) return
    cancelling = true
    try {
      const res = await fetch(`/api/jobs/${data.job.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.message ?? 'Не вдалось скасувати')
        return
      }
      goto('/dashboard/jobs', { invalidateAll: true })
    } catch {
      toast.error('Помилка зʼєднання')
    } finally {
      cancelling = false
      cancelDialogOpen = false
    }
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
        toast.error(json?.message ?? 'Не вдалось прийняти')
        return
      }
      if (json.orderId) goto(`/dashboard/orders/${json.orderId}`, { invalidateAll: true })
      else location.reload()
    } catch {
      toast.error('Помилка зʼєднання')
    } finally {
      acceptingId = null
    }
  }

  const cardCls =
    'rounded-[26px] border border-border bg-card shadow-[0_20px_50px_-16px_rgba(0,0,0,0.1),0_4px_12px_-6px_rgba(0,0,0,0.04)]'
  const badgeBase =
    'inline-flex h-[22px] items-center gap-1 rounded-full px-2.5 text-[10px] font-bold tracking-[0.06em] uppercase'
</script>

<div class="  min-h-svh px-5 py-12">
  <div class="mx-auto w-full max-w-135">
    <!-- Back -->
    <button
      type="button"
      onclick={() => goto('/dashboard/jobs')}
      class="mb-3.5 inline-flex cursor-pointer items-center gap-1.5 rounded-md text-[13.5px] font-medium text-muted-foreground transition-opacity hover:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <ArrowLeft class="size-4" aria-hidden="true" /> До моїх заявок
    </button>

    <!-- ═══ HEADER CARD ═══ -->
    <div class="{cardCls} mb-3">
      <div class="p-6">
        <div class="mb-3.5 flex flex-wrap items-center gap-2.5">
          <span class="{badgeBase} {statusBadge(data.job.status)}"
            >{statusLabel(data.job.status)}</span
          >
          <span class="text-xs text-muted-foreground"
            >{formatRelative(data.job.createdAt)}</span
          >
          {#if data.job.status === 'OPEN'}
            <span class="text-xs text-muted-foreground"
              >· Активна ще {expiresIn(data.job.expiresAt)}</span
            >
          {/if}
        </div>

        <h1
          class="mb-3 text-[22px] font-bold tracking-[-0.025em] wrap-break-word text-foreground"
        >
          {data.job.title}
        </h1>

        {#if data.job.description}
          <p
            class="mb-4.5 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word text-foreground"
          >
            {data.job.description}
          </p>
        {/if}

        {#if details.length > 0}
          <div class="mb-4.5 overflow-hidden rounded-2xl border border-border">
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
                  <span class="shrink-0 text-muted-foreground">{d.label}</span>
                  <span
                    class="min-w-0 text-right font-semibold wrap-break-word text-foreground"
                    >{d.value}</span
                  >
                </div>
              {/if}
            {/each}
          </div>
        {/if}

        {#if data.job.attachments && data.job.attachments.length > 0}
          <div class="mb-4.5">
            <PhotoGallery images={data.job.attachments} />
          </div>
        {/if}

        <div
          class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <MapPin class="size-3.75" aria-hidden="true" />{data.job.city}
        </div>

        <hr class="my-4 border-border" />

        <div
          class="flex items-center gap-4.5 text-[12.5px] text-muted-foreground"
        >
          <span class="inline-flex items-center gap-1.5">
            <MessageSquare class="size-3.75" aria-hidden="true" />
            {data.job.proposalsCount} пропозиц{data.job.proposalsCount === 1
              ? 'ія'
              : 'ій'}
          </span>
          <span class="inline-flex items-center gap-1.5"
            ><Eye class="size-3.75" aria-hidden="true" />{data.job.viewsCount} переглядів</span
          >
        </div>

        {#if data.job.status === 'OPEN'}
          <hr class="my-4 border-border" />
          <button
            type="button"
            onclick={() => (cancelDialogOpen = true)}
            disabled={cancelling}
            class="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-sm font-medium text-destructive transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive disabled:opacity-50"
          >
            {#if cancelling}
              <Spinner /> Скасовуємо…
            {:else}
              Скасувати заявку
            {/if}
          </button>
        {/if}
      </div>
    </div>

    <!-- ═══ PROPOSALS ═══ -->
    {#if data.proposals.length > 0}
      {@const recommended = data.proposals.filter((p) => p.recommended)}
      {@const others = data.proposals.filter((p) => !p.recommended)}
      {@const visible = showAll
        ? data.proposals
        : recommended.length > 0
          ? recommended
          : data.proposals}

      <div class="mt-6 mb-3 flex items-center justify-between px-1">
        <h2 class="text-base font-bold tracking-[-0.01em] text-foreground">
          {recommended.length > 0 && !showAll
            ? 'Рекомендуємо для вас'
            : 'Відгуки майстрів'}
        </h2>
        <span class="text-xs tabular-nums text-muted-foreground"
          >{data.proposals.length}</span
        >
      </div>

      <div class="space-y-3">
        {#each visible as p (p.id)}
          <div
            class="{cardCls} group p-6 transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_54px_-18px_rgba(0,0,0,0.16),0_6px_14px_-8px_rgba(0,0,0,0.05)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 {p.recommended
              ? 'border-amber-400/40!'
              : ''}"
          >
            <div class="mb-3.5 flex items-start justify-between gap-3">
              <a
                href={p.master.username ? `/@${p.master.username}` : '#'}
                class="group/m flex min-w-0 items-center gap-2.75 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Avatar
                  class="size-10.5 shrink-0 shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)]"
                >
                  <AvatarImage
                    src={p.master.avatar ?? ''}
                    alt={p.master.name ?? ''}
                  />
                  <AvatarFallback
                    class="bg-muted text-sm font-bold text-muted-foreground"
                    >{initials(p.master.name)}</AvatarFallback
                  >
                </Avatar>
                <div class="min-w-0">
                  <p
                    class="truncate text-[14.5px] font-semibold text-foreground group-hover/m:underline"
                  >
                    {p.master.name ?? 'Майстер'}
                  </p>
                  <div
                    class="mt-0.5 flex items-center gap-1.75 text-[12.5px] text-muted-foreground"
                  >
                    {#if p.master.reviewsCount > 0}
                      <span class="inline-flex items-center gap-1"
                        ><Star
                          class="size-3 fill-amber-400 text-amber-400"
                          aria-hidden="true"
                        />{p.master.avgRating.toFixed(1)} ({p.master
                          .reviewsCount})</span
                      >
                      <span>·</span>
                    {/if}
                    <span>{formatRelative(p.createdAt)}</span>
                  </div>
                </div>
              </a>
              <div class="flex shrink-0 items-center gap-1.75">
                {#if p.recommended}
                  <span class="{badgeBase} bg-foreground text-background"
                    ><Star
                      class="size-3 fill-current"
                      aria-hidden="true"
                    />Топ</span
                  >
                {/if}
                {#if p.isNew}
                  <span
                    class="{badgeBase} border bg-card"
                    style="border-color: var(--brand); color: var(--brand)"
                    >Новачок</span
                  >
                {/if}
                <span class="{badgeBase} {proposalBadge(p.status)}"
                  >{proposalStatusLabel(p.status)}</span
                >
              </div>
            </div>

            <p
              class="mb-4 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word text-foreground"
            >
              {p.message}
            </p>

            <div
              class="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3.5"
            >
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2.75 text-[12.5px] font-medium text-muted-foreground"
                  ><Clock class="size-3" aria-hidden="true" />{p.estimatedDays} дн</span
                >
                <span
                  class="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted px-2.75 text-[12.5px] font-bold tabular-nums text-foreground"
                  ><Wallet class="size-3" aria-hidden="true" />{formatMoney(
                    p.priceCents,
                    data.job.currency,
                  )}</span
                >
              </div>
              {#if p.status === 'SENT' && data.job.status === 'OPEN'}
                <button
                  type="button"
                  disabled={acceptingId !== null}
                  aria-busy={acceptingId === p.id}
                  onclick={() => {
                    pendingAcceptId = p.id
                    acceptDialogOpen = true
                  }}
                  class="inline-flex h-10 cursor-pointer items-center gap-1.75 rounded-full bg-foreground px-4.5 text-[13.5px] font-semibold text-background transition hover:-translate-y-px active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  {#if acceptingId === p.id}
                    <Spinner /> Приймаємо…
                  {:else}
                    <CheckCircle2 class="size-3.75" aria-hidden="true" /> Прийняти
                  {/if}
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      {#if !showAll && others.length > 0 && recommended.length > 0}
        <button
          type="button"
          onclick={() => (showAll = true)}
          class="mt-1 w-full cursor-pointer rounded-2xl bg-muted py-3.25 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Показати всі відгуки ({data.proposals.length})
        </button>
      {/if}
    {:else if data.job.status === 'OPEN'}
      <div class="{cardCls} p-6">
        <Zuna
          variant="card"
          size={48}
          showName
          online
          typewriter
          text="Шукаю для тебе майстрів. Можеш спокійно займатися справами — я надішлю сповіщення, щойно хтось відгукнеться."
        />
      </div>
    {/if}
  </div>
</div>

<!-- Модалка скасування заявки -->
<AlertDialog.Root bind:open={cancelDialogOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Видалити замовлення</AlertDialog.Title>
      <AlertDialog.Description
        >Ви дійсно хочете видалити це замовлення?</AlertDialog.Description
      >
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={cancelling}>Скасувати</AlertDialog.Cancel>
      <AlertDialog.Action
        onclick={cancelJob}
        disabled={cancelling}
        variant="destructive"
        class="  text-[#ff595a] hover:bg-[#ff595a]/10"
      >
        {cancelling ? 'Зачекайте…' : 'Видалити'}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

 

<!-- Модалка прийняття пропозиції -->
<AlertDialog.Root bind:open={acceptDialogOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Прийняти пропозицію?</AlertDialog.Title>
      <AlertDialog.Description
        >Інші відгуки буде відхилено, і відкриється чат з обраним клінером.</AlertDialog.Description
      >
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

 
