<script lang="ts">
  import { enhance } from '$app/forms'
  import { Button } from '$lib/components/ui/button'
  import { Textarea } from '$lib/components/ui/textarea'
  import { REPORT_REASONS } from '$lib/reports/reasons'
  import { formatPrice } from '$lib/orders/labels'
  import { formatFull, formatRelative } from '$lib/utils/time'
  import ChevronLeft from '$lib/components/icons/set/chevron-left.svelte'
  import CircleAlert from '$lib/components/icons/set/circle-alert.svelte'
  import type { ActionData, PageData } from './$types'

  let { data, form }: { data: PageData; form: ActionData } = $props()
  const r = $derived(data.report)

  let busy = $state(false)
  const submit = () => {
    busy = true
    return async ({ update }: { update: () => Promise<void> }) => {
      await update()
      busy = false
    }
  }

  const reasonLabel = $derived(
    REPORT_REASONS.find((x) => x.key === r.reason)?.label ?? r.reason,
  )
  const roleLabel = (role: string) =>
    role === 'MASTER' ? 'майстер' : role === 'CLIENT' ? 'клієнт' : role.toLowerCase()
  const nameOf = (id: string) =>
    id === r.reporter.id ? (r.reporter.name ?? 'Скаржник') : (r.target.name ?? 'Той, на кого скарга')
</script>

<svelte:head><title>Скарга · Адмінка Zunor</title></svelte:head>

<a
  href="/admin/reports"
  class="inline-flex items-center gap-1 text-[13.5px] text-muted-foreground hover:text-foreground"
>
  <ChevronLeft size={16} /> Скарги
</a>

<h1 class="mt-3 text-2xl font-semibold tracking-tight">{reasonLabel}</h1>
<p class="mt-1 text-[13.5px] text-muted-foreground">
  {formatFull(r.createdAt)} ({formatRelative(r.createdAt)})
</p>

<div class="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
  <div class="flex flex-col gap-6">
    <div class="grid gap-3 sm:grid-cols-2">
      {#each [{ title: 'Хто скаржиться', p: r.reporter }, { title: 'На кого', p: r.target }] as side (side.title)}
        <a
          href="/admin/users/{side.p.id}"
          class="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40"
        >
          <p class="text-[12.5px] text-muted-foreground">{side.title}</p>
          <p class="mt-0.5 text-[15px] font-medium">{side.p.name ?? 'Без імені'}</p>
          <p class="text-[13px] text-muted-foreground">
            {roleLabel(side.p.role)} · {side.p.email}
            {#if side.p.banned}<span class="text-destructive"> · заблоковано</span>{/if}
          </p>
        </a>
      {/each}
    </div>

    <p class="text-[13.5px] text-muted-foreground">
      Усього скарг на цю людину: <span class="font-medium text-foreground">{data.targetReports}</span>
    </p>

    {#if r.text}
      <section>
        <h2 class="mb-2 text-[15px] font-medium">Що сталося</h2>
        <p class="rounded-xl border border-border bg-card p-4 text-[14.5px] leading-relaxed whitespace-pre-line">
          {r.text}
        </p>
      </section>
    {/if}

    {#if data.order}
      <section>
        <h2 class="mb-2 text-[15px] font-medium">Замовлення</h2>
        <div class="rounded-xl border border-border bg-card p-4 text-[14px]">
          <p class="font-medium">{data.order.title}</p>
          <p class="mt-1 text-muted-foreground">
            {data.order.status} · {formatPrice(data.order.priceCents, data.order.currency)} ·
            {formatFull(data.order.createdAt)}
          </p>
          {#if data.order.cancelReason}
            <p class="mt-2">Причина скасування: {data.order.cancelReason}</p>
          {/if}
        </div>
      </section>
    {/if}

    {#if data.job}
      <section>
        <h2 class="mb-2 text-[15px] font-medium">Заявка</h2>
        <div class="rounded-xl border border-border bg-card p-4 text-[14px]">
          <p class="font-medium">{data.job.title}</p>
          <p class="mt-1 text-muted-foreground">{data.job.status} · {formatFull(data.job.createdAt)}</p>
          {#if data.job.description}
            <p class="mt-2 leading-relaxed whitespace-pre-line">{data.job.description}</p>
          {/if}
        </div>
      </section>
    {/if}

    {#if data.messages.length}
      <section>
        <h2 class="mb-2 text-[15px] font-medium">Останні повідомлення чату</h2>
        <p class="mb-2 text-[12.5px] text-muted-foreground">
          Перегляд записано в журнал дій.
        </p>
        <ol class="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
          {#each data.messages as msg (msg.id)}
            <li class="text-[14px] leading-relaxed">
              <span class="font-medium">{nameOf(msg.senderId)}:</span>
              {msg.text || (msg.type === 'TEXT' ? '' : '[вкладення]')}
              <span class="text-[12px] text-muted-foreground"> · {formatRelative(msg.createdAt)}</span>
            </li>
          {/each}
        </ol>
      </section>
    {/if}
  </div>

  <aside class="flex flex-col gap-3 self-start rounded-xl border border-border bg-card p-4">
    <h2 class="text-[15px] font-medium">Рішення</h2>
    {#if r.status !== 'OPEN'}
      <p class="text-[14px]">
        {r.status === 'RESOLVED' ? 'Розглянуто' : 'Відхилено'}
        {#if r.resolvedAt}· {formatRelative(r.resolvedAt)}{/if}
      </p>
      {#if r.resolution}<p class="text-[14px] text-muted-foreground">{r.resolution}</p>{/if}
    {:else}
      {#if form?.error}
        <p class="flex items-center gap-1.5 text-[12.5px] text-destructive" role="alert">
          <CircleAlert class="size-3.5 shrink-0" />{form.error}
        </p>
      {/if}
      <form method="POST" use:enhance={submit} class="flex flex-col gap-2">
        <Textarea
          name="resolution"
          rows={3}
          maxlength={500}
          placeholder="Що зроблено (для журналу): попередили, заблокували…"
        />
        <Button type="submit" formaction="?/resolve" class="h-10" disabled={busy}>
          Розглянуто
        </Button>
        <Button type="submit" formaction="?/dismiss" variant="secondary" class="h-10" disabled={busy}>
          Відхилити скаргу
        </Button>
      </form>
      <p class="text-[12.5px] leading-relaxed text-muted-foreground">
        «Розглянуто» — скаржник отримає сповіщення. Заблокувати людину — на її
        сторінці (посилання «На кого» вище).
      </p>
    {/if}
  </aside>
</div>
