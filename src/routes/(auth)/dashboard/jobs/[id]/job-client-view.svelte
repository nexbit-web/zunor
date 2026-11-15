<!--
  Заявка очима клієнта: пропозиції майстрів — ПЕРШИМИ, окремою карткою
  над заявкою. Клієнт приходить сюди здебільшого по сповіщенню «нова
  пропозиція», і його дія — обрати майстра; заявку він написав сам і
  знає. Під пропозиціями — сама заявка (JobSummary — спільний із
  майстром, картка за зразком вакансії work.ua), угорі її картки — меню
  ⋮ із «Редагувати заявку» й «Скасувати заявку»: дія рідкісна й незворотна, тож не кнопкою на
  виду.

  Мова та сама, що в «Моїх заявках»: шапка PageHead, рядки з волосиною
  замість карток із рамкою, колір — лише там, де клієнт має щось зробити
  (стан «є пропозиції», кнопка «Обрати майстра»). Рекомендовану пропозицію
  видно з плашки біля імені, а не з кольорової рамки навколо всієї картки:
  рамка кричала голосніше за саму пропозицію.

  Логіка 1:1: cancelJob / acceptProposal (з модалками), showAll
  (recommended vs others). Усе клієнтське — UX; сервер валідує власність і
  права повторно.

  Телефон майстра — просто в пропозиції (власник): клієнт обирає за
  описом, дзвонить і домовляється про ціну, майстер оновлює її у своїй
  пропозиції, і тоді клієнт його обирає. Чат — лише після вибору, у
  замовленні.
-->
<script lang="ts">
  import { goto } from '$app/navigation'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Button } from '$lib/components/ui/button'
  import { Spinner } from '$lib/components/ui/spinner'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import Check from '$lib/components/icons/set/check.svelte'
  import ChevronLeft from '$lib/components/icons/set/chevron-left.svelte'
  import Star from '$lib/components/icons/set/star.svelte'
  import MoreVertical from '$lib/components/icons/set/more-vertical.svelte'
  import Trash2 from '$lib/components/icons/set/trash-2.svelte'
  import Pencil from '$lib/components/icons/set/pencil.svelte'
  import Phone from '$lib/components/icons/set/phone.svelte'
  import PageHead from '$lib/components/dashboard/page-head.svelte'
  import JobSummary from '$lib/components/jobs/job-summary.svelte'
  import JobState from '$lib/components/jobs/job-state.svelte'
  import AssistantCard from '$lib/components/assistant-card.svelte'
  import toast from 'svelte-hot-french-toast'
  import {
    formatDays,
    formatMoney,
    formatRelative,
    initials,
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

  // Пропозиція, яку зараз підтверджують у діалозі «Обрати», — щоб
  // назвати в ньому ціну: обирають саме за нею, і після дзвінка вона
  // могла змінитись.
  const pendingAccept = $derived(
    data.proposals.find((p) => p.id === pendingAcceptId),
  )

  const recommended = $derived(data.proposals.filter((p) => p.recommended))
  const othersCount = $derived(data.proposals.length - recommended.length)
  const visible = $derived(
    showAll || recommended.length === 0 ? data.proposals : recommended,
  )

  // Стан пропозиції показуємо, лише коли він не «Очікує»: поки заявка
  // відкрита, очікують усі, і однакова плашка на кожному рядку — шум.
  const PROPOSAL_TONE: Record<string, string> = {
    ACCEPTED: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
    REJECTED: 'bg-muted text-muted-foreground',
    WITHDRAWN: 'bg-muted text-muted-foreground',
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
      // Тост, бо сторінка зникає: на /dashboard/jobs заявки вже немає,
      // і без повідомлення незрозуміло, чи вона скасована, чи не збереглась.
      toast('Заявку скасовано')
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
      // Ключовий момент усього маркетплейсу — тут заявка стає замовленням.
      // Сторінка змінюється на іншу, тож підтвердити подію більше нічому:
      // на екрані замовлення вже не написано, що майстра щойно обрано.
      toast.success('Майстра обрано! Домовляйтесь у чаті про деталі')
      if (json.orderId)
        goto(`/dashboard/orders/${json.orderId}`, { invalidateAll: true })
      else location.reload()
    } catch {
      toast.error('Помилка зʼєднання')
    } finally {
      acceptingId = null
    }
  }

  const chip =
    'inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium whitespace-nowrap'
</script>

<PageHead>
  <a
    href="/dashboard/jobs"
    class="-ml-1.5 inline-flex h-8 items-center gap-0.5 rounded-lg pr-2 pl-0.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
  >
    <ChevronLeft class="size-5" aria-hidden="true" />
    Мої заявки
  </a>
</PageHead>

<div class="flex flex-col gap-6">
  {#if data.proposals.length > 0}
    <section id="proposals" class="rounded-2xl border border-border bg-card px-4 py-5 sm:px-8 sm:py-7">
      <div class="flex items-baseline justify-between gap-3">
        <h2 class="text-lg font-semibold tracking-tight">
          {recommended.length > 0 && !showAll
            ? 'Рекомендуємо для вас'
            : 'Пропозиції майстрів'}
        </h2>
        <span class="text-sm tabular-nums text-muted-foreground">
          {data.proposals.length}
        </span>
      </div>
      {#if data.job.status === 'OPEN'}
        <p class="mt-1 text-[13px] text-muted-foreground">
          Порівняйте пропозиції й подзвоніть майстру, щоб домовитись про ціну.
          Домовились — майстер оновить ціну у своїй пропозиції, а ви оберіть
          його.
        </p>
      {/if}

      <ul class="mt-3">
        {#each visible as p (p.id)}
          {@const profile = p.master.username
            ? `/@${p.master.username}`
            : undefined}
          {@const canAccept = p.status === 'SENT' && data.job.status === 'OPEN'}
          <li class="border-t border-border/60 py-4 last:pb-0">
            <div class="flex items-start gap-3">
              <!-- Без @handle профілю немає — тоді й посилання немає, а не
                   «#», що прокручував сторінку нагору. -->
              <svelte:element
                this={profile ? 'a' : 'div'}
                href={profile}
                class="group/m flex min-w-0 flex-1 items-start gap-3 rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Avatar class="size-10 shrink-0">
                  <AvatarImage src={p.master.avatar ?? ''} alt="" />
                  <AvatarFallback
                    class="bg-muted text-sm font-semibold text-muted-foreground"
                  >
                    {initials(p.master.name)}
                  </AvatarFallback>
                </Avatar>

                <span class="min-w-0">
                  <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      class={[
                        'text-[15px] font-medium text-foreground',
                        profile && 'group-hover/m:underline',
                      ]}
                    >
                      {p.master.name ?? 'Майстер'}
                    </span>
                    {#if p.recommended}
                      <span class="{chip} bg-primary/10 text-primary">
                        <Star class="size-3 fill-current" aria-hidden="true" />
                        Рекомендуємо
                      </span>
                    {/if}
                    {#if p.isNew}
                      <span class="{chip} bg-muted text-foreground/80">
                        Новачок
                      </span>
                    {/if}
                    {#if PROPOSAL_TONE[p.status]}
                      <span class="{chip} {PROPOSAL_TONE[p.status]}">
                        {proposalStatusLabel(p.status)}
                      </span>
                    {/if}
                  </span>

                  <span
                    class="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground"
                  >
                    {#if p.master.reviewsCount > 0}
                      <Star
                        class="size-3 shrink-0 fill-amber-400 text-amber-400"
                        aria-hidden="true"
                      />
                      <span class="font-medium text-foreground/80">
                        {p.master.avgRating.toFixed(1)}
                      </span>
                      <span>({p.master.reviewsCount})</span>
                      <span aria-hidden="true">·</span>
                    {/if}
                    <span>{formatRelative(p.createdAt)}</span>
                  </span>
                </span>
              </svelte:element>

              <!-- Ціна праворуч, як у прайсі: клієнт порівнює пропозиції
                   саме за нею, і око має знаходити її на тому самому місці
                   в кожному рядку. -->
              <div class="shrink-0 text-right">
                <p class="text-base font-semibold tabular-nums text-foreground">
                  {formatMoney(p.priceCents, data.job.currency)}
                </p>
                <p class="mt-0.5 text-[12.5px] text-muted-foreground">
                  {formatDays(p.estimatedDays)}
                </p>
              </div>
            </div>

            <p
              class="mt-3 text-[14.5px] leading-relaxed whitespace-pre-line text-pretty wrap-break-word text-foreground sm:pl-13"
            >
              {p.message}
            </p>

            {#if canAccept || p.master.phone}
              <!-- Дзвінок — поруч із вибором: спершу домовитись, потім
                   обрати. Номер видно на самій кнопці — його можна й
                   переписати з компʼютера, а не лише набрати. -->
              <div class="mt-3 flex flex-wrap items-center gap-2 sm:pl-13">
                {#if canAccept}
                  <Button
                    variant="primary"
                    disabled={acceptingId !== null}
                    aria-busy={acceptingId === p.id}
                    onclick={() => {
                      pendingAcceptId = p.id
                      acceptDialogOpen = true
                    }}
                  >
                    {#if acceptingId === p.id}
                      <Spinner /> Обираємо…
                    {:else}
                      <Check aria-hidden="true" /> Обрати майстра
                    {/if}
                  </Button>
                {/if}
                {#if p.master.phone}
                  <Button
                    variant="secondary"
                    href="tel:{p.master.phone}"
                    aria-label="Подзвонити: {p.master.phone}"
                  >
                    <Phone aria-hidden="true" />
                    <span class="tabular-nums">{p.master.phone}</span>
                  </Button>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>

      {#if !showAll && recommended.length > 0 && othersCount > 0}
        <Button
          variant="secondary"
          class="mt-4 w-full"
          onclick={() => (showAll = true)}
        >
          Показати всі пропозиції ({data.proposals.length})
        </Button>
      {/if}
    </section>
  {/if}

  <article class="rounded-2xl border border-border bg-card px-4 py-5 sm:px-8 sm:py-7">
    <JobSummary job={data.job}>
      {#snippet status()}
        <JobState
          status={data.job.status}
          proposalsCount={data.job.proposalsCount}
        />
      {/snippet}

      {#snippet menu()}
        {#if data.job.status === 'OPEN'}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              aria-label="Ще дії із заявкою"
              disabled={cancelling}
              class="flex size-10 cursor-pointer items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:bg-accent data-[state=open]:text-foreground"
            >
              {#if cancelling}
                <Spinner />
              {:else}
                <MoreVertical size={20} strokeWidth={1.75} />
              {/if}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" sideOffset={6} class="w-56">
              <DropdownMenu.Item
                class="cursor-pointer"
                onSelect={() => goto(`/dashboard/jobs/${data.job.id}/edit`)}
              >
                <Pencil /> Редагувати заявку
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item
                variant="destructive"
                class="cursor-pointer"
                onSelect={() => (cancelDialogOpen = true)}
              >
                <Trash2 /> Скасувати заявку
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {/if}
      {/snippet}
    </JobSummary>

    {#if data.proposals.length === 0 && data.job.status === 'OPEN'}
      <div class="mt-8 rounded-2xl bg-muted/40">
        <AssistantCard
          variant="card"
          size={44}
          showName
          online
          typewriter
          text="Zunor уже шукає майстрів. Можете спокійно займатися справами — сповіщення прийде, щойно хтось відгукнеться."
        />
      </div>
    {/if}
  </article>
</div>

<AlertDialog.Root bind:open={cancelDialogOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Скасувати заявку?</AlertDialog.Title>
      <AlertDialog.Description>
        Майстри більше не бачитимуть її і не зможуть надіслати пропозиції.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={cancelling}>Назад</AlertDialog.Cancel>
      <AlertDialog.Action
        onclick={cancelJob}
        disabled={cancelling}
        variant="destructive"
      >
        {cancelling ? 'Зачекайте…' : 'Скасувати заявку'}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={acceptDialogOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Обрати цього майстра?</AlertDialog.Title>
      <AlertDialog.Description>
        {#if pendingAccept}
          Ціна — {formatMoney(pendingAccept.priceCents, data.job.currency)}.
        {/if}
        Інші пропозиції буде відхилено, а ви перейдете до замовлення: там
        відкриється чат із майстром.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={acceptingId !== null}>Назад</AlertDialog.Cancel>
      <AlertDialog.Action
        onclick={() => {
          acceptDialogOpen = false
          if (pendingAcceptId) acceptProposal(pendingAcceptId)
        }}
        disabled={acceptingId !== null}
      >
        Обрати
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
