<!--
  Заявка очима майстра — за зразком вакансії на work.ua: одна картка, у
  ній угорі головна дія («Подати пропозицію»), факти з іконками,
  подробиці (JobSummary — спільний із клієнтом), а внизу картка
  пропозиції з візерунком чату — як «Задайте питання в месенджері» у
  них: хто замовник і кнопка, щоб не гортати назад догори.

  Форма пропозиції — картка налаштувань (SettingsGroup + Field), як усі
  форми застосунку.
-->
<script lang="ts">
  import { tick } from 'svelte'
  import { goto, invalidateAll } from '$app/navigation'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import MoreVertical from '$lib/components/icons/set/more-vertical.svelte'
  import UserIcon from '$lib/components/icons/set/user.svelte'
  import LinkIcon from '$lib/components/icons/set/link.svelte'
  import FlagIcon from '$lib/components/icons/set/flag.svelte'
  import ReportDialog from '$lib/components/reports/report-dialog.svelte'
  import { copyToClipboard } from '$lib/utils/clipboard'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Spinner } from '$lib/components/ui/spinner'
  import ChevronLeft from '$lib/components/icons/set/chevron-left.svelte'
  import Check from '$lib/components/icons/set/check.svelte'
  import CircleAlert from '$lib/components/icons/set/circle-alert.svelte'
  import Info from '$lib/components/icons/set/info.svelte'
  import Send from '$lib/components/icons/set/send.svelte'
  import Star from '$lib/components/icons/set/star.svelte'
  import PageHead from '$lib/components/dashboard/page-head.svelte'
  import JobSummary from '$lib/components/jobs/job-summary.svelte'
  import JobState from '$lib/components/jobs/job-state.svelte'
  import InfoRow from '$lib/components/jobs/info-row.svelte'
  import {
    SettingsGroup,
    SettingsField,
    SettingsBlock,
  } from '$lib/components/settings'
  import {
    formatDays,
    formatMoney,
    formatRelative,
    memberSince,
    initials,
    proposalStatusLabel,
  } from '$lib/components/jobs/display'
  import type { PageData } from './$types'
  import toast from 'svelte-hot-french-toast'

  let { data }: { data: PageData } = $props()

  // ─── Форма відгуку ───
  let formOpen = $state(false)
  let reportOpen = $state(false)
  let message = $state('')
  let priceUah = $state<number | ''>('')
  let estimatedDays = $state<number | ''>('')
  let submitting = $state(false)
  let errorMsg = $state<string | null>(null)

  const messageLen = $derived(message.trim().length)
  const messageInvalid = $derived(
    messageLen > 0 && (messageLen < 20 || messageLen > 922),
  )
  const canSubmit = $derived(
    !submitting &&
      messageLen >= 20 &&
      messageLen <= 922 &&
      typeof priceUah === 'number' &&
      priceUah >= 50 &&
      priceUah <= 500_000 &&
      typeof estimatedDays === 'number' &&
      estimatedDays >= 1 &&
      estimatedDays <= 180,
  )

  const PROPOSAL_TONE: Record<string, string> = {
    SENT: 'bg-primary/10 text-primary',
    ACCEPTED: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
    REJECTED: 'bg-muted text-muted-foreground',
    WITHDRAWN: 'bg-muted text-muted-foreground',
  }

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

  // ─── Жартівливі реакції на суму/термін ───
  function priceJoke(v: number): string | null {
    if (v >= 300_000) return 'Ого! Таких грошей навіть у нас немає'
    if (v >= 100_000) return 'Опа, а це вже цікаво'
    if (v >= 50_001) return '50 тисяч - це максимум'
    if (v >= 50_000) return 'Це вже гроші'
    if (v > 0 && v < 100) return 'Чого так мало?'
    if (v == 0) return 'Мало коштів'
    return null
  }

  function daysJoke(v: number): string | null {
    if (v >= 90) return '🐢 Три місяці? Клієнт встигне переїхати двічі.'
    if (v >= 30) return '📅 '
    if (v >= 10) return 'А ви не поспішаєте'
    if (v === 0) return 'Як це 0?'
    return null
  }

  function onPriceBlur() {
    if (typeof priceUah !== 'number') return
    const joke = priceJoke(priceUah)
    toast.dismiss('price-joke')
    if (joke) toast(joke, { id: 'price-joke', duration: 3500 })
  }

  function onDaysBlur() {
    if (typeof estimatedDays !== 'number') return
    const joke = daysJoke(estimatedDays)
    toast.dismiss('days-joke')
    if (joke) toast(joke, { id: 'days-joke', duration: 3500 })
  }

  function closeForm() {
    formOpen = false
    errorMsg = null
  }

  // Кнопка вгорі й кнопка в картці внизу відкривають ту саму форму — і
  // підводять до неї: інакше з верхньої кнопки форма розкрилась би десь
  // під згином екрана, і здавалось би, що нічого не сталося.
  let formEl = $state<HTMLFormElement | undefined>(undefined)

  async function openForm() {
    formOpen = true
    await tick()
    formEl?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    document.getElementById('proposal-price')?.focus({ preventScroll: true })
  }
</script>

<PageHead>
  <a
    href="/dashboard/jobs"
    class="-ml-1.5 inline-flex h-8 items-center gap-0.5 rounded-lg pr-2 pl-0.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
  >
    <ChevronLeft class="size-5" aria-hidden="true" />
    Знайти роботу
  </a>
</PageHead>

<!-- Головна дія — лише коли вона є: без неї JobSummary не малює
     порожню смугу, а меню стає в рядок «Опубліковано». -->
{#snippet primaryAction()}
  {#if data.canPropose}
    <Button
      variant="primary"
      size="lg"
      class="h-11 rounded-[10px] px-5 text-[15px]"
      onclick={openForm}
    >
      <Send aria-hidden="true" /> Подати пропозицію
    </Button>
  {:else}
    <span
      class="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-muted px-3 text-sm font-medium text-foreground/80"
    >
      <Check class="size-4" strokeWidth={2} /> Пропозицію надіслано
    </span>
  {/if}
{/snippet}

<article class="rounded-2xl border border-border bg-card px-4 py-5 sm:px-8 sm:py-7">
  <JobSummary
    job={data.job}
    client={data.job.client}
    viewer="master"
    actions={data.canPropose || data.proposals.length > 0
      ? primaryAction
      : undefined}
  >
    {#snippet status()}
      <JobState status={data.job.status} viewer="master" />
    {/snippet}

    <!-- Меню ⋮ праворуч, як у work.ua: рідкісні дії не займають смугу. -->
    {#snippet menu()}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label="Ще дії із заявкою"
          class="flex size-10 cursor-pointer items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:bg-accent data-[state=open]:text-foreground"
        >
          <MoreVertical size={20} strokeWidth={1.75} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" sideOffset={6} class="w-60">
          <DropdownMenu.Item
            class="cursor-pointer"
            onSelect={() => goto(`/dashboard/client/${data.job.client.id}`)}
          >
            <UserIcon /> Профіль замовника
          </DropdownMenu.Item>
          <DropdownMenu.Item
            class="cursor-pointer"
            onSelect={() =>
              copyToClipboard(location.href, 'Посилання скопійовано')}
          >
            <LinkIcon /> Скопіювати посилання
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item
            variant="destructive"
            class="cursor-pointer"
            onSelect={() => (reportOpen = true)}
          >
            <FlagIcon /> Поскаржитися
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/snippet}
  </JobSummary>

  <!-- Скарга на заявку — це скарга на її автора, з заявкою як контекстом
       (фейкова заявка, вимоги поза Zunor). -->
  <ReportDialog
    bind:open={reportOpen}
    targetId={data.job.client.id}
    targetName={data.job.client.name}
    targetRole="CLIENT"
    context={{ jobId: data.job.id }}
  />

  {#if data.proposals.length > 0}
    <!-- Майстер уже подав пропозицію -->
    {#each data.proposals as p (p.id)}
      <div class="mt-8">
        <SettingsGroup
          title="Ваша пропозиція"
          footnote="Надіслано {formatRelative(p.createdAt)}"
        >
          <SettingsBlock>
            <p
              class="text-[14.5px] leading-relaxed whitespace-pre-line text-pretty wrap-break-word text-foreground"
            >
              {p.message}
            </p>
          </SettingsBlock>
          <InfoRow label="Ціна">
            <span class="tabular-nums">
              {formatMoney(p.priceCents, data.job.currency)}
            </span>
          </InfoRow>
          <InfoRow label="Термін">{formatDays(p.estimatedDays)}</InfoRow>
          <InfoRow label="Стан">
            <span
              class="inline-flex h-6 items-center rounded-full px-2.5 text-[12.5px] font-medium {PROPOSAL_TONE[
                p.status
              ] ?? 'bg-muted text-muted-foreground'}"
            >
              {proposalStatusLabel(p.status)}
            </span>
          </InfoRow>
        </SettingsGroup>
      </div>
    {/each}
  {:else if data.canPropose}
    {#if !formOpen}
      <!-- Картка внизу — як «Задайте питання в месенджері» на work.ua:
           заклик зверху на візерунку чату, під лінією — хто замовник і
           кнопка. Майстрові не треба гортати назад до верхньої кнопки. -->
      <section class="mt-8 overflow-hidden rounded-2xl border border-border">
        <div class="propose-hero relative px-5 py-7 text-center sm:px-8">
          <h2 class="relative text-[19px] font-semibold tracking-[-0.01em]">
            Зацікавила заявка?
          </h2>
          <p
            class="relative mx-auto mt-1.5 max-w-md text-[14.5px] leading-relaxed text-muted-foreground"
          >
            Назвіть ціну й термін — клієнт одразу отримає сповіщення.
            Телефонами обміняєтесь, щойно він вас обере.
          </p>
        </div>

        <div
          class="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border px-5 py-4 sm:px-6"
        >
          <a
            href="/dashboard/client/{data.job.client.id}"
            class="group flex min-w-0 flex-[1_1_15rem] items-center gap-3 rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Avatar class="size-11 shrink-0">
              <AvatarImage src={data.job.client.avatar ?? ''} alt="" />
              <AvatarFallback
                class="bg-muted text-sm font-semibold text-muted-foreground"
              >
                {initials(data.job.client.name)}
              </AvatarFallback>
            </Avatar>
            <span class="min-w-0">
              <span
                class="block truncate text-[15px] font-medium text-foreground group-hover:underline"
              >
                {data.job.client.name ?? 'Замовник'}
              </span>
              <span
                class="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground"
              >
                {#if data.job.client.reviewsCount > 0}
                  <Star
                    class="size-3 shrink-0 fill-amber-400 text-amber-400"
                    aria-hidden="true"
                  />
                  <span class="font-medium text-foreground/80">
                    {data.job.client.avgRating.toFixed(1)}
                  </span>
                  <span>({data.job.client.reviewsCount})</span>
                  <span aria-hidden="true">·</span>
                {/if}
                <span class="truncate">
                  на Zunor з {memberSince(data.job.client.createdAt)}
                </span>
              </span>
            </span>
          </a>

          <Button
            variant="outline"
            size="lg"
            class="h-11 w-full rounded-[10px] border-primary/40 px-5 text-[15px] text-primary hover:bg-primary/5 sm:w-auto"
            onclick={openForm}
          >
            <Send aria-hidden="true" /> Подати пропозицію
          </Button>
        </div>
      </section>
    {:else}
      <form
        bind:this={formEl}
        class="mt-8 scroll-mt-6"
        novalidate
        onsubmit={(e) => {
          e.preventDefault()
          submitProposal()
        }}
      >
        <SettingsGroup
          title="Ваша пропозиція"
          footnote="Клієнт побачить ціну, термін і повідомлення. Телефонами ви обміняєтесь, лише коли він вас обере."
        >
          <SettingsField label="Ціна" for="proposal-price">
            {#snippet control()}
              <div class="relative">
                <Input
                  id="proposal-price"
                  type="number"
                  inputmode="numeric"
                  bind:value={priceUah}
                  onblur={onPriceBlur}
                  min={50}
                  max={500000}
                  placeholder="0"
                  class="pr-8 tabular-nums"
                />
                <span
                  class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
                  aria-hidden="true">₴</span
                >
              </div>
            {/snippet}
          </SettingsField>

          <SettingsField label="Термін виконання" for="proposal-days">
            {#snippet control()}
              <div class="relative">
                <Input
                  id="proposal-days"
                  type="number"
                  inputmode="numeric"
                  bind:value={estimatedDays}
                  onblur={onDaysBlur}
                  min={1}
                  max={180}
                  placeholder="1"
                  class="pr-14 tabular-nums"
                />
                <span
                  class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
                  aria-hidden="true">днів</span
                >
              </div>
            {/snippet}
          </SettingsField>

          <SettingsBlock>
            <div class="mb-2 flex items-center justify-between gap-3">
              <label for="proposal-msg" class="text-sm">
                Повідомлення клієнту
              </label>
              <span
                class={[
                  'text-[12px] tabular-nums',
                  messageInvalid ? 'text-destructive' : 'text-muted-foreground',
                ]}
              >
                {messageLen} / 922
              </span>
            </div>
            <Textarea
              id="proposal-msg"
              bind:value={message}
              aria-invalid={messageInvalid}
              placeholder="Розкажіть, як виконаєте роботу: що входить, які засоби, ваш досвід. Мінімум 20 символів."
              class="min-h-28 resize-none"
            />
          </SettingsBlock>
        </SettingsGroup>

        {#if errorMsg}
          <p
            class="mt-3 flex items-start gap-1.5 px-1 text-[13px] text-destructive"
            role="alert"
          >
            <CircleAlert class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {errorMsg}
          </p>
        {/if}

        <div class="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            type="button"
            onclick={closeForm}
            disabled={submitting}
          >
            Скасувати
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={!canSubmit}
            aria-busy={submitting}
          >
            {#if submitting}
              <Spinner /> Надсилаємо…
            {:else}
              <Send aria-hidden="true" /> Надіслати пропозицію
            {/if}
          </Button>
        </div>
      </form>
    {/if}
  {:else if data.cantProposeReason}
    <!-- Раніше тут не було нічого: майстер із неактивним профілем чи без
         цієї категорії бачив заявку без жодної дії й без пояснення чому. -->
    <p
      class="mt-8 flex items-center gap-2.5 rounded-xl bg-muted/40 px-4 py-3.5 text-sm text-muted-foreground"
    >
      <Info class="size-4 shrink-0" aria-hidden="true" />
      {data.cantProposeReason}
    </p>
  {/if}
</article>

<style>
  /* Візерунок чату (той самий, що на шпалерах повідомлень) — маскою,
     кольором акценту ледь-ледь: читається як «тут розмова», а не як
     картинка, і йде за обраним акцентом. */
  .propose-hero::before {
    content: '';
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--primary) 14%, transparent);
    mask: url('/chat-pattern.svg') 0 0 / 520px auto repeat;
    -webkit-mask: url('/chat-pattern.svg') 0 0 / 520px auto repeat;
    pointer-events: none;
  }
</style>
