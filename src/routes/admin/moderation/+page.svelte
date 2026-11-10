<script lang="ts">
  import { crewLabel } from '$lib/masters/meta'
  import { formatRelative } from '$lib/utils/time'
  import ChevronRight from '$lib/components/icons/set/chevron-right.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  const TABS = [
    { key: 'PENDING', label: 'Чекають' },
    { key: 'REJECTED', label: 'Відхилені' },
    { key: 'VERIFIED', label: 'Перевірені' },
  ] as const
</script>

<svelte:head><title>Анкети · Адмінка Zunor</title></svelte:head>

<div class="flex flex-wrap items-center justify-between gap-3">
  <h1 class="text-2xl font-semibold tracking-tight">Анкети майстрів</h1>
  <nav aria-label="Статус" class="flex rounded-lg bg-muted p-0.5">
    {#each TABS as t (t.key)}
      <a
        href="?status={t.key}"
        aria-current={data.status === t.key ? 'true' : undefined}
        class={[
          'rounded-md px-3 py-1.5 text-[13.5px] transition-colors',
          data.status === t.key
            ? 'bg-card font-medium text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        ]}
      >
        {t.label}
      </a>
    {/each}
  </nav>
</div>

{#if data.items.length === 0}
  <p class="mt-16 text-center text-[15px] text-muted-foreground">
    {data.status === 'PENDING' ? 'Черга порожня — усі анкети перевірено.' : 'Тут поки нікого.'}
  </p>
{:else}
  <ul class="mt-6 flex flex-col overflow-hidden rounded-xl border border-border bg-card">
    {#each data.items as m (m.id)}
      <li class="border-t border-border/60 first:border-t-0">
        <a
          href="/admin/moderation/{m.id}"
          class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
        >
          {#if m.avatar}
            <img src={m.avatar} alt="" class="size-10 shrink-0 rounded-full object-cover" />
          {:else}
            <span
              class="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-[15px] font-semibold text-muted-foreground"
            >
              {m.name?.[0]?.toUpperCase() ?? '?'}
            </span>
          {/if}
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[15px] font-medium">{m.name ?? 'Без імені'}</span>
            <span class="block truncate text-[13px] text-muted-foreground">
              {m.email}{m.city ? ` · ${m.city}` : ''}{m.crew ? ` · ${crewLabel(m.crew)}` : ''} · фото: {m.photos}
            </span>
          </span>
          <span class="hidden shrink-0 text-[13px] text-muted-foreground sm:block">
            {formatRelative(m.submittedAt)}
          </span>
          <ChevronRight size={18} class="shrink-0 text-muted-foreground" />
        </a>
      </li>
    {/each}
  </ul>
{/if}
