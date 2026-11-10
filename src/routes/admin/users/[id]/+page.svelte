<script lang="ts">
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import { Button } from '$lib/components/ui/button'
  import { Textarea } from '$lib/components/ui/textarea'
  import { atLeast, isStaff, ROLE_LABEL } from '$lib/admin/roles'
  import { REPORT_REASONS } from '$lib/reports/reasons'
  import { formatFull, formatRelative } from '$lib/utils/time'
  import ChevronLeft from '$lib/components/icons/set/chevron-left.svelte'
  import CircleAlert from '$lib/components/icons/set/circle-alert.svelte'
  import type { ActionData, PageData } from './$types'

  let { data, form }: { data: PageData; form: ActionData } = $props()
  const u = $derived(data.user)
  const canBan = $derived(atLeast(page.data.staff?.role, 'MANAGER'))

  let busy = $state(false)
  const submit = () => {
    busy = true
    return async ({ update }: { update: () => Promise<void> }) => {
      await update()
      busy = false
    }
  }

  const roleLabel = $derived(
    isStaff(u.role) ? ROLE_LABEL[u.role] : u.role === 'MASTER' ? 'Майстер' : 'Клієнт',
  )
  const reasonLabel = (key: string) =>
    REPORT_REASONS.find((r) => r.key === key)?.label ?? key

  const facts = $derived(
    [
      ['Пошта', `${u.email}${u.emailVerified ? '' : ' (не підтверджена)'}`],
      ['Роль', roleLabel],
      ['Профіль', u.username ? `@${u.username}` : null],
      ['Телефон', u.phone],
      ['Місто', u.city],
      ['Зареєструвався', formatFull(u.createdAt)],
      ['Був онлайн', formatRelative(u.lastSeen)],
      ['Telegram', u.telegram ? 'Підключено' : 'Ні'],
      [
        'Рейтинг',
        u.role === 'MASTER'
          ? u.reviewsCountAsMaster
            ? `${u.avgRatingAsMaster.toFixed(1)} (${u.reviewsCountAsMaster})`
            : 'Відгуків немає'
          : u.reviewsCountAsClient
            ? `${u.avgRatingAsClient.toFixed(1)} (${u.reviewsCountAsClient})`
            : 'Відгуків немає',
      ],
      ['Заявок', String(data.stats.jobs)],
      ['Замовлень (клієнт / майстер)', `${data.stats.ordersAsClient} / ${data.stats.ordersAsMaster}`],
      ['Активних замовлень', String(data.stats.activeOrders)],
      ['Скарг на нього / від нього', `${data.stats.reportsReceived} / ${data.stats.reportsFiled}`],
    ].filter(([, v]) => v) as [string, string][],
  )
</script>

<svelte:head><title>{u.name ?? 'Користувач'} · Адмінка Zunor</title></svelte:head>

<a
  href={canBan ? '/admin/users' : '/admin/reports'}
  class="inline-flex items-center gap-1 text-[13.5px] text-muted-foreground hover:text-foreground"
>
  <ChevronLeft size={16} /> {canBan ? 'Користувачі' : 'Скарги'}
</a>

<div class="mt-3 flex flex-wrap items-center gap-4">
  {#if u.avatar}
    <img src={u.avatar} alt="" class="size-16 rounded-full object-cover" />
  {/if}
  <div class="min-w-0">
    <h1 class="text-2xl font-semibold tracking-tight">{u.name ?? 'Без імені'}</h1>
    <p class="mt-1 flex flex-wrap gap-x-3 text-[13.5px]">
      {#if u.deleted}
        <span class="text-muted-foreground">Акаунт видалено власником</span>
      {:else if u.banned}
        <span class="text-destructive">Заблоковано: {u.banReason}</span>
      {/if}
      {#if u.verification}
        <a href="/admin/moderation/{u.id}" class="text-primary hover:underline">Анкета майстра</a>
      {/if}
      {#if u.username && !u.banned}
        <a href="/@{u.username}" target="_blank" rel="noopener" class="text-primary hover:underline">
          Публічна сторінка
        </a>
      {/if}
    </p>
  </div>
</div>

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

    {#if data.recentReports.length}
      <section>
        <h2 class="mb-2 text-[15px] font-medium">Скарги на цю людину</h2>
        <ul class="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
          {#each data.recentReports as r (r.id)}
            <li class="border-t border-border/60 first:border-t-0">
              <a
                href="/admin/reports/{r.id}"
                class="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px] hover:bg-muted/50"
              >
                <span class="truncate">{reasonLabel(r.reason)}</span>
                <span class="shrink-0 text-[12.5px] text-muted-foreground">
                  {r.status === 'OPEN' ? 'нова' : r.status === 'RESOLVED' ? 'розглянута' : 'відхилена'}
                  · {formatRelative(r.createdAt)}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>

  {#if canBan && !u.deleted}
    <aside class="flex flex-col gap-3 self-start rounded-xl border border-border bg-card p-4">
      <h2 class="text-[15px] font-medium">Блокування</h2>
      {#if form && 'error' in form && form.error}
        <p class="flex items-center gap-1.5 text-[12.5px] text-destructive" role="alert">
          <CircleAlert class="size-3.5 shrink-0" />{form.error}
        </p>
      {/if}
      {#if u.banned}
        <form method="POST" action="?/unban" use:enhance={submit}>
          <Button type="submit" variant="secondary" class="h-10 w-full" disabled={busy}>
            Розблокувати
          </Button>
        </form>
      {:else}
        <p class="text-[12.5px] leading-relaxed text-muted-foreground">
          Людину одразу викине з усіх пристроїв. Її відкриті заявки буде
          скасовано, пропозиції — відкликано.
          {#if data.stats.activeOrders}
            <span class="text-destructive">
              Активних замовлень: {data.stats.activeOrders} — друга сторона лишиться без
              виконавця чи клієнта.
            </span>
          {/if}
        </p>
        <form method="POST" action="?/ban" use:enhance={submit} class="flex flex-col gap-2">
          <Textarea name="reason" rows={3} maxlength={500} placeholder="Причина (для журналу)" />
          <Button type="submit" variant="destructive" class="h-10 w-full" disabled={busy}>
            Заблокувати
          </Button>
        </form>
      {/if}
    </aside>
  {/if}
</div>
