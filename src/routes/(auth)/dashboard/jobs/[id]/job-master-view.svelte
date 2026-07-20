<!-- src/routes/(auth)/jobs/[id]/job-master-view.svelte -->
<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Label } from '$lib/components/ui/label'
  import { Spinner } from '$lib/components/ui/spinner'
  import {
    ArrowLeft,
    MapPin,
    Clock,
    Eye,
    MessageSquare,
    Star,
    XCircle,
    Send,
    ChevronRight,
  } from 'lucide-svelte'
  import { describeJob } from '$lib/categories/cleaning/describe'
  import PhotoGallery from '$lib/components/photo-gallery.svelte'
  import {
    formatMoney,
    formatRelative,
    expiresIn,
    memberSince,
    initials,
    statusLabel,
    proposalStatusLabel,
  } from '$lib/components/jobs/display'
  import type { PageData } from './$types'
  import { Button } from '$lib/components/ui/button'
  import toast from 'svelte-hot-french-toast'

  let { data }: { data: PageData } = $props()

  const details = $derived(describeJob(data.job.metadata))

  // ─── Форма відгуку ───
  let formOpen = $state(false)
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
    if (v >= 50_001) return '50 тисяч - це максемум'
    if (v >= 50_000) return 'Це вже гроші'
    if (v > 0 && v < 100) return 'Чого так мало?'
    if (v == 0 ) return 'Мало коштів'
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
    if (joke) toast(joke, { id: 'price-joke', duration: 3500 })
  }

  function onDaysBlur() {
    if (typeof estimatedDays !== 'number') return
    const joke = daysJoke(estimatedDays)
    if (joke) toast(joke, { id: 'days-joke', duration: 3500 })
  }

  const cardCls =
    'rounded-[26px] border border-border bg-card shadow-[0_20px_50px_-16px_rgba(0,0,0,0.1),0_4px_12px_-6px_rgba(0,0,0,0.04)]'
  const badgeBase =
    'inline-flex h-[22px] items-center rounded-full px-2.5 text-[10px] font-bold tracking-[0.06em] uppercase'
</script>

<div class="jobview-scope min-h-svh px-5 py-8">
  <div class="mx-auto flex w-full max-w-135 flex-col gap-3">
    <!-- Back -->
    <button
      type="button"
      onclick={() => goto('/dashboard/jobs')}
      class="inline-flex cursor-pointer items-center gap-1.5 self-start rounded-md text-[13.5px] font-medium text-muted-foreground transition-opacity hover:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <ArrowLeft class="size-4" aria-hidden="true" /> До списку
    </button>

    <!-- ═══ HEADER CARD ═══ -->
    <div class={cardCls}>
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
          class="mb-3 text-[22px] font-bold tracking-[-0.025em] text-foreground"
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

        <!-- Характеристики -->
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
                        <span class="font-medium text-foreground"
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
                  <span class="text-right font-semibold text-foreground"
                    >{d.value}</span
                  >
                </div>
              {/if}
            {/each}
          </div>
        {/if}

        <!-- Фото обсягу робіт -->
        {#if data.job.attachments && data.job.attachments.length > 0}
          <div class="mb-4.5">
            <PhotoGallery images={data.job.attachments} />
          </div>
        {/if}

        <!-- Місто -->
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
            ><Eye class="size-3.75" aria-hidden="true" />{data.job
              .viewsCount}</span
          >
        </div>
      </div>
    </div>

    <!-- ═══ CLIENT CARD ═══ -->
    <div class={cardCls}>
      <div class="p-6">
        <p
          class="mb-3.5 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
        >
          Замовник
        </p>
        <a
          href="/dashboard/client/{data.job.client.id}"
          class="group flex items-center gap-3.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Avatar class="size-11.5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)]">
            <AvatarImage
              src={data.job.client.avatar ?? ''}
              alt={data.job.client.name ?? ''}
            />
            <AvatarFallback
              class="bg-muted text-base font-bold text-muted-foreground"
              >{initials(data.job.client.name)}</AvatarFallback
            >
          </Avatar>
          <div class="min-w-0 flex-1">
            <p
              class="text-[14.5px] font-semibold text-foreground group-hover:underline"
            >
              {data.job.client.name ?? 'Замовник'}
            </p>
            <div
              class="mt-0.5 flex items-center gap-1.75 text-[12.5px] text-muted-foreground"
            >
              {#if data.job.client.reviewsCount > 0}
                <span class="inline-flex items-center gap-1"
                  ><Star
                    class="size-3 fill-amber-400 text-amber-400"
                    aria-hidden="true"
                  />{data.job.client.avgRating.toFixed(1)} ({data.job.client
                    .reviewsCount})</span
                >
                <span>·</span>
              {/if}
              <span>З {memberSince(data.job.client.createdAt)}</span>
            </div>
          </div>
          <ChevronRight
            class="ml-auto size-4.5 text-muted-foreground"
            aria-hidden="true"
          />
        </a>
      </div>
    </div>

    <!-- ═══ ACTION AREA ═══ -->
    {#if data.proposals.length > 0}
      <!-- Майстер уже подав пропозицію -->
      {#each data.proposals as p (p.id)}
        <div class={cardCls}>
          <div class="p-6">
            <div class="mb-3.5 flex items-center justify-between">
              <p
                class="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
              >
                Ваша пропозиція
              </p>
              <span class="{badgeBase} {proposalBadge(p.status)}"
                >{proposalStatusLabel(p.status)}</span
              >
            </div>

            <p
              class="mb-4 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word text-foreground"
            >
              {p.message}
            </p>

            <hr class="my-3 border-border" />

            <div
              class="flex items-center gap-3 text-[12.5px] text-muted-foreground"
            >
              <span class="inline-flex items-center gap-1.5"
                ><Clock class="size-3.75" aria-hidden="true" />{p.estimatedDays} дн</span
              >
              <span>·</span>
              <span class="font-bold tabular-nums text-foreground"
                >{formatMoney(p.priceCents, data.job.currency)}</span
              >
              <span class="ml-auto">{formatRelative(p.createdAt)}</span>
            </div>
          </div>
        </div>
      {/each}
    {:else if data.canPropose}
      <div class={cardCls}>
        <div class="p-6">
          {#if !formOpen}
            <!-- CTA -->
            <div class="py-1 text-center">
              <div
                class="mx-auto mb-3.5 flex size-12.5 items-center justify-center rounded-2xl bg-primary text-white shadow-sm"
              >
                <Send class="size-5" aria-hidden="true" />
              </div>
              <p
                class="mb-1.25 text-[17px] font-bold tracking-[-0.02em] text-foreground"
              >
                Зацікавила заявка?
              </p>
              <p
                class="mx-auto mb-4.5 max-w-75 text-[13.5px] leading-relaxed text-muted-foreground"
              >
                Запропонуйте ціну та термін — клієнт одразу отримає сповіщення.
              </p>
              <Button
                type="button"
                onclick={() => (formOpen = true)}
                class="inline-flex h-12.5 cursor-pointer items-center justify-center gap-2.25 rounded-full bg-primary px-6.5 text-[14.5px] font-semibold text-white transition hover:-translate-y-px active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <Send class="size-4" aria-hidden="true" /> Подати пропозицію
              </Button>
            </div>
          {:else}
            <!-- ФОРМА -->
            <div class="space-y-5">
              <!-- Ціна -->
              <div>
                <Label
                  for="proposal-price"
                  class="mb-2 block text-[13.5px] font-semibold text-foreground"
                  >Ваша ціна</Label
                >
                <div
                  class="jv-field flex h-16.5 items-center gap-2.5 rounded-[18px] px-5"
                >
                  <input
                    id="proposal-price"
                    type="number"
                    inputmode="numeric"
                    bind:value={priceUah}
                    onblur={onPriceBlur}
                    min={50}
                    max={500000}
                    placeholder="0"
                    class="min-w-0 flex-1 bg-transparent text-[30px] font-bold tabular-nums text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <span
                    class="shrink-0 text-2xl font-bold text-muted-foreground"
                    >₴</span
                  >
                </div>
              </div>

              <!-- Термін -->
              <div>
                <Label
                  for="proposal-days"
                  class="mb-2 block text-[13.5px] font-semibold text-foreground"
                  >Термін виконання</Label
                >
                <div
                  class="jv-field flex h-12.5 items-center gap-2 rounded-[14px] px-4"
                >
                  <input
                    id="proposal-days"
                    type="number"
                    inputmode="numeric"
                    bind:value={estimatedDays}
                    onblur={onDaysBlur}
                    min={1}
                    max={180}
                    placeholder="3"
                    class="min-w-0 flex-1 bg-transparent text-[15px] font-semibold tabular-nums text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <span class="shrink-0 text-[13.5px] text-muted-foreground"
                    >днів</span
                  >
                </div>
              </div>

              <!-- Повідомлення -->
              <div>
                <div class="mb-2 flex items-center justify-between">
                  <Label
                    for="proposal-msg"
                    class="text-[13.5px] font-semibold text-foreground"
                    >Повідомлення клієнту</Label
                  >
                  <span
                    class="text-[11px] tabular-nums {messageInvalid
                      ? 'text-destructive'
                      : 'text-muted-foreground'}">{messageLen} / 922</span
                  >
                </div>
                <Textarea
                  id="proposal-msg"
                  bind:value={message}
                  rows={4}
                  aria-invalid={messageInvalid}
                  placeholder="Розкажіть, як виконаєте роботу. Що входить, які матеріали, досвід. Мінімум 20 символів."
                  class="jv-input resize-none"
                />
              </div>

              {#if errorMsg}
                <div
                  class="flex items-start gap-2 rounded-[14px] border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                  role="alert"
                >
                  <XCircle
                    class="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  /><span>{errorMsg}</span>
                </div>
              {/if}

              <div class="flex items-center gap-2.5 pt-1">
                <Button
                  variant="outline"
                  type="button"
                  onclick={() => {
                    formOpen = false
                    errorMsg = null
                  }}
                  disabled={submitting}
                  class="inline-flex h-12.5 cursor-pointer items-center rounded-full px-5 text-[14.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                  >Скасувати</Button
                >
                <Button
                  type="button"
                  onclick={submitProposal}
                  disabled={!canSubmit}
                  aria-busy={submitting}
                  class="relative inline-flex h-12.5 flex-1 cursor-pointer items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-white transition hover:-translate-y-px active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:translate-y-0 disabled:opacity-40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  {#if submitting}
                    <span class="pointer-events-none">Зачекайте…</span>
                    <Spinner class="absolute right-4" aria-hidden="true" />
                  {:else}
                    <span
                      class="pointer-events-none inline-flex items-center gap-2.25"
                    >
                      <Send class="size-4" aria-hidden="true" /> Відправити відгук
                    </span>
                  {/if}
                </Button>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  :global(body:has(.jobview-scope)) {
    background:
      radial-gradient(
        130% 90% at 12% -5%,
        color-mix(in oklch, var(--muted) 55%, var(--background)) 0%,
        transparent 50%
      ),
      radial-gradient(
        130% 90% at 100% 105%,
        color-mix(in oklch, var(--secondary) 60%, var(--background)) 0%,
        transparent 52%
      ),
      var(--background);
  }

  /* Textarea відгуку — на токенах (:global, бо клас іде в shadcn-компонент). */
  .jobview-scope :global(.jv-input) {
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--muted);
    color: var(--foreground);
    font-size: 14.5px;
    padding: 16px;
    outline: none;
    transition:
      border-color 0.16s ease,
      background 0.16s ease,
      box-shadow 0.16s ease;
  }
  .jobview-scope :global(.jv-input::placeholder) {
    color: var(--muted-foreground);
  }
  .jobview-scope :global(.jv-input:focus) {
    background: var(--background);
    border-color: var(--ring);
    box-shadow: 0 0 0 4px color-mix(in oklch, var(--ring) 22%, transparent);
  }

  /* Обгортки числових полів (ціна/термін) — focus-within ring. */
  .jv-field {
    border: 1px solid var(--border);
    background: var(--muted);
    transition:
      border-color 0.16s ease,
      background 0.16s ease,
      box-shadow 0.16s ease;
  }
  .jv-field:focus-within {
    border-color: var(--ring);
    background: var(--background);
    box-shadow: 0 0 0 4px color-mix(in oklch, var(--ring) 22%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .jobview-scope :global(.jv-input),
    .jv-field {
      transition: none;
    }
  }
</style>
