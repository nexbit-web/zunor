<script lang="ts">
  import { REPORT_REASONS } from '$lib/reports/reasons'
  import { formatRelative } from '$lib/utils/time'
  import ChevronRight from '$lib/components/icons/set/chevron-right.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  const TABS = [
    { key: 'OPEN', label: 'Нові' },
    { key: 'RESOLVED', label: 'Розглянуті' },
    { key: 'DISMISSED', label: 'Відхилені' },
  ] as const

  const reasonLabel = (key: string) =>
    REPORT_REASONS.find((r) => r.key === key)?.label ?? key
</script>

<svelte:head><title>Скарги · Адмінка Zunor</title></svelte:head>

<div class="flex flex-wrap items-center justify-between gap-3">
  <h1 class="text-2xl font-semibold tracking-tight">Скарги</h1>
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
    {data.status === 'OPEN' ? 'Нових скарг немає.' : 'Тут поки порожньо.'}
  </p>
{:else}
  <ul class="mt-6 flex flex-col overflow-hidden rounded-xl border border-border bg-card">
    {#each data.items as r (r.id)}
      <li class="border-t border-border/60 first:border-t-0">
        <a
          href="/admin/reports/{r.id}"
          class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[15px] font-medium">{reasonLabel(r.reason)}</span>
            <span class="block truncate text-[13px] text-muted-foreground">
              {r.reporter ?? '—'} → {r.target ?? '—'}
              ({r.targetRole === 'MASTER' ? 'майстер' : 'клієнт'}) · {r.context}
            </span>
            {#if r.text}
              <span class="mt-0.5 line-clamp-1 block text-[13px] text-muted-foreground">
                «{r.text}»
              </span>
            {/if}
          </span>
          <span class="hidden shrink-0 text-[13px] text-muted-foreground sm:block">
            {formatRelative(r.createdAt)}
          </span>
          <ChevronRight size={18} class="shrink-0 text-muted-foreground" />
        </a>
      </li>
    {/each}
  </ul>
{/if}
