<script lang="ts">
  import { enhance } from '$app/forms'
  import { Button } from '$lib/components/ui/button'
  import { Textarea } from '$lib/components/ui/textarea'
  import { crewLabel } from '$lib/masters/meta'
  import { formatFull, formatRelative } from '$lib/utils/time'
  import ChevronLeft from '$lib/components/icons/set/chevron-left.svelte'
  import CircleAlert from '$lib/components/icons/set/circle-alert.svelte'
  import type { ActionData, PageData } from './$types'

  let { data, form }: { data: PageData; form: ActionData } = $props()
  const m = $derived(data.master)

  let busy = $state(false)
  const submit = () => {
    busy = true
    return async ({ update }: { update: () => Promise<void> }) => {
      await update()
      busy = false
    }
  }

  const STATUS = {
    PENDING: { label: 'Чекає перевірки', cls: 'bg-amber-500/12 text-amber-700 dark:text-amber-400' },
    VERIFIED: { label: 'Перевірено', cls: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400' },
    REJECTED: { label: 'Відхилено', cls: 'bg-destructive/10 text-destructive' },
    NONE: { label: 'Не подано', cls: 'bg-muted text-muted-foreground' },
  } as const

  const facts = $derived(
    [
      ['Пошта', m.email],
      ['Профіль', m.username ? `@${m.username}` : null],
      ['Місто й район', [m.city, m.district].filter(Boolean).join(', ') || null],
      ['Формат', m.crew ? crewLabel(m.crew) : null],
      ['Авто', m.hasVehicle === null ? null : m.hasVehicle ? 'Є' : 'Немає'],
      ['Їздить до', m.travelRadiusKm ? `${m.travelRadiusKm} км` : 'Будь-куди'],
      ['Послуги', m.categories.join(', ') || null],
      ['На Zunor з', formatFull(m.createdAt)],
      ['Замовлень виконано', String(m.completedOrders)],
      ['Рейтинг', m.reviews ? `${m.rating.toFixed(1)} (${m.reviews})` : 'Відгуків немає'],
      ['Скарг на нього', String(m.reportsCount)],
    ].filter(([, v]) => v) as [string, string][],
  )
</script>

<svelte:head><title>{m.name ?? 'Анкета'} · Адмінка Zunor</title></svelte:head>

<a
  href="/admin/moderation"
  class="inline-flex items-center gap-1 text-[13.5px] text-muted-foreground hover:text-foreground"
>
  <ChevronLeft size={16} /> Анкети
</a>

<div class="mt-3 flex flex-wrap items-center gap-4">
  {#if m.avatar}
    <img src={m.avatar} alt="" class="size-16 rounded-full object-cover" />
  {/if}
  <div class="min-w-0">
    <h1 class="text-2xl font-semibold tracking-tight">{m.name ?? 'Без імені'}</h1>
    <p class="mt-1 flex flex-wrap items-center gap-2 text-[13.5px] text-muted-foreground">
      <span class="rounded-md px-2 py-0.5 text-[12.5px] font-medium {STATUS[m.status].cls}">
        {STATUS[m.status].label}
      </span>
      Подано {formatRelative(m.submittedAt)}
      {#if m.banned}<span class="text-destructive">· Заблоковано</span>{/if}
    </p>
  </div>
</div>

{#if m.status === 'REJECTED' && m.rejectReason}
  <p class="mt-4 rounded-lg bg-destructive/8 px-3 py-2 text-[13.5px]">
    Причина відмови: {m.rejectReason}
  </p>
{/if}

<div class="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
  <div class="flex flex-col gap-6">
    <dl class="grid gap-x-6 gap-y-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
      {#each facts as [k, v] (k)}
        <div class="min-w-0">
          <dt class="text-[12.5px] text-muted-foreground">{k}</dt>
          <dd class="text-[14.5px] break-words">{v}</dd>
        </div>
      {/each}
    </dl>

    {#if m.description || m.bio}
      <section>
        <h2 class="mb-2 text-[15px] font-medium">Про себе</h2>
        <p class="rounded-xl border border-border bg-card p-4 text-[14.5px] leading-relaxed whitespace-pre-line">
          {m.description ?? m.bio}
        </p>
      </section>
    {/if}

    <section>
      <h2 class="mb-2 text-[15px] font-medium">Приклади робіт ({m.portfolio.length})</h2>
      {#if m.portfolio.length}
        <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {#each m.portfolio as src (src)}
            <a href={src} target="_blank" rel="noopener noreferrer">
              <img src={src} alt="" class="aspect-square w-full rounded-lg object-cover" />
            </a>
          {/each}
        </div>
      {:else}
        <p class="text-[14px] text-muted-foreground">Фото немає.</p>
      {/if}
    </section>
  </div>

  <!-- Рішення. Майстер отримає сповіщення (і в Telegram), причину
       відмови — дослівно: пишіть так, щоб він зрозумів, що виправити. -->
  <aside class="flex flex-col gap-3 self-start rounded-xl border border-border bg-card p-4">
    <h2 class="text-[15px] font-medium">Рішення</h2>
    {#if form?.error}
      <p class="flex items-center gap-1.5 text-[12.5px] text-destructive" role="alert">
        <CircleAlert class="size-3.5 shrink-0" />{form.error}
      </p>
    {/if}
    {#if m.status !== 'VERIFIED'}
      <form method="POST" action="?/approve" use:enhance={submit}>
        <Button type="submit" class="h-10 w-full" disabled={busy}>Підтвердити</Button>
      </form>
    {/if}
    {#if m.status !== 'REJECTED'}
      <form method="POST" action="?/reject" use:enhance={submit} class="flex flex-col gap-2">
        <Textarea
          name="reason"
          rows={3}
          maxlength={500}
          placeholder="Причину побачить майстер. Наприклад: «Фото профілю не показує обличчя»."
        />
        <Button type="submit" variant="destructive" class="h-10 w-full" disabled={busy}>
          {m.status === 'VERIFIED' ? 'Зняти верифікацію' : 'Відхилити'}
        </Button>
      </form>
    {/if}
  </aside>
</div>
