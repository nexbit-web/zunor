<!-- src/routes/(auth)/dashboard/proposals/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Briefcase, Clock, X } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import * as Tabs from '$lib/components/ui/tabs'
  import { formatBudget } from '$lib/orders/labels'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  let activeTab = $state<'ALL' | 'SENT' | 'ACCEPTED' | 'REJECTED'>('ALL')

  const filtered = $derived(
    activeTab === 'ALL'
      ? data.proposals
      : data.proposals.filter((p) => p.status === activeTab),
  )

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
    return `${diffDays} днів тому`
  }

  function statusLabel(status: string): { label: string; color: string } {
    switch (status) {
      case 'SENT':
        return { label: 'Очікує', color: 'var(--muted-foreground)' }
      case 'ACCEPTED':
        return { label: 'Обрано вас!', color: '#16a34a' }
      case 'REJECTED':
        return { label: 'Не обрано', color: 'var(--muted-foreground)' }
      case 'WITHDRAWN':
        return { label: 'Відкликано', color: 'var(--muted-foreground)' }
      default:
        return { label: status, color: 'var(--muted-foreground)' }
    }
  }

  async function withdraw(id: string) {
    if (!confirm('Відкликати відгук?')) return
    const res = await fetch(`/api/proposals/${id}`, { method: 'DELETE' })
    if (res.ok) {
      // Перезавантажити сторінку
      window.location.reload()
    }
  }
</script>

<svelte:head>
  <title>Мої відгуки · Zunor</title>
</svelte:head>

<div class="max-w-5xl mx-auto px-4 sm:px-6 py-8">
  <div class="flex items-start justify-between gap-4 mb-6">
    <div>
      <h1
        class="text-2xl font-semibold tracking-tight"
        style="color: var(--foreground)"
      >
        Мої відгуки
      </h1>
      <p class="text-sm mt-1" style="color: var(--muted-foreground)">
        Відгуки на заявки клієнтів
      </p>
    </div>
    <Button variant="outline" onclick={() => goto('/jobs')}>
      <Briefcase class="size-4 mr-1" />
      Знайти роботу
    </Button>
  </div>

  <!-- Statistics -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
    <div
      class="rounded-xl p-4"
      style="background-color: var(--muted); border: 1px solid var(--border)"
    >
      <p class="text-[11px]" style="color: var(--muted-foreground)">Усього</p>
      <p
        class="text-xl font-bold tabular-nums"
        style="color: var(--foreground)"
      >
        {data.proposals.length}
      </p>
    </div>
    <div
      class="rounded-xl p-4"
      style="background-color: var(--muted); border: 1px solid var(--border)"
    >
      <p class="text-[11px]" style="color: var(--muted-foreground)">Обрано</p>
      <p class="text-xl font-bold tabular-nums" style="color: #16a34a">
        {data.counts.accepted}
      </p>
    </div>

    <div
      class="rounded-xl p-4"
      style="background-color: var(--muted); border: 1px solid var(--border)"
    >
      <p class="text-[11px]" style="color: var(--muted-foreground)">
        Конверсія
      </p>
      <p
        class="text-xl font-bold tabular-nums"
        style="color: var(--foreground)"
      >
        {data.proposals.length > 0
          ? Math.round((data.counts.accepted / data.proposals.length) * 100)
          : 0}%
      </p>
    </div>
  </div>

  <Tabs.Root bind:value={activeTab}>
    <Tabs.List class="mb-5">
      <Tabs.Trigger value="ALL" class="text-xs">
        Усі <span class="ml-1.5 opacity-60 tabular-nums"
          >{data.proposals.length}</span
        >
      </Tabs.Trigger>
      <Tabs.Trigger value="SENT" class="text-xs">
        Очікують
        <span class="ml-1.5 opacity-60 tabular-nums">{data.counts.sent}</span>
      </Tabs.Trigger>
      <Tabs.Trigger value="ACCEPTED" class="text-xs">
        Прийняті
        <span class="ml-1.5 opacity-60 tabular-nums"
          >{data.counts.accepted}</span
        >
      </Tabs.Trigger>
      <Tabs.Trigger value="REJECTED" class="text-xs">
        Відхилені
        <span class="ml-1.5 opacity-60 tabular-nums"
          >{data.counts.rejected}</span
        >
      </Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value={activeTab}>
      {#if filtered.length === 0}
        <div
          class="rounded-xl p-12 text-center"
          style="background-color: var(--muted); border: 1px solid var(--border)"
        >
          <p class="text-sm" style="color: var(--muted-foreground)">
            Немає відгуків у цій категорії
          </p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each filtered as proposal (proposal.id)}
            {@const status = statusLabel(proposal.status)}
            <div
              class="rounded-xl p-4"
              style="background-color: var(--card);
                     border: 1px solid {proposal.status === 'ACCEPTED'
                ? 'var(--primary)'
                : 'var(--border)'};
                     opacity: {proposal.status === 'REJECTED' ||
              proposal.status === 'WITHDRAWN'
                ? 0.6
                : 1}"
            >
              <div class="flex items-start justify-between gap-3 mb-2">
                <div class="flex-1 min-w-0">
                  <a
                    href={`/jobs/${proposal.job.id}`}
                    class="text-[15px] font-semibold hover:underline block"
                    style="color: var(--foreground)"
                  >
                    {proposal.job.title}
                  </a>
                  <div
                    class="flex items-center gap-2 mt-1 text-[11px]"
                    style="color: var(--muted-foreground)"
                  >
                    <Avatar class="size-4">
                      <AvatarImage
                        src={proposal.job.client.avatar ?? ''}
                        alt={proposal.job.client.name ?? ''}
                      />
                      <AvatarFallback
                        class="text-[8px] font-semibold"
                        style="background-color: var(--muted); color: var(--foreground)"
                      >
                        {proposal.job.client.name?.[0]?.toUpperCase() ?? '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span>{proposal.job.client.name}</span>
                    <span>·</span>
                    <span>{proposal.job.category}</span>
                  </div>
                </div>
                <span class="text-sm font-semibold">
                  {formatBudget(
                    proposal.job.budgetMinCents,
                    proposal.job.budgetMaxCents,
                  )}
                </span>
              </div>

              <p
                class="text-[13px] line-clamp-2 mb-3"
                style="color: var(--muted-foreground)"
              >
                {proposal.message}
              </p>

              <div
                class="flex items-center justify-between gap-2 pt-3"
                style="border-top: 1px solid var(--border)"
              >
                <div
                  class="flex items-center gap-3 text-[11px]"
                  style="color: var(--muted-foreground)"
                >
                  <span class="flex items-center gap-1">
                    <Clock class="size-3" />
                    {proposal.estimatedDays} днів
                  </span>
                  <span class="font-medium tabular-nums">
                    Ваша ціна: {formatMoney(proposal.priceCents)}
                  </span>
                  <span>{formatRelative(proposal.createdAt)}</span>
                </div>

                <div class="flex items-center gap-2">
                  <span
                    class="text-[10px] font-bold uppercase"
                    style="color: {status.color}"
                  >
                    {status.label}
                  </span>
                  {#if proposal.status === 'SENT'}
                    <button
                      type="button"
                      onclick={() => withdraw(proposal.id)}
                      class="size-6 rounded-full flex items-center justify-center cursor-pointer hover:opacity-70"
                      style="color: var(--muted-foreground)"
                      title="Відкликати"
                    >
                      <X class="size-3.5" />
                    </button>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </Tabs.Content>
  </Tabs.Root>
</div>
