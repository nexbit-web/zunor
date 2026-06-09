<!-- src/routes/(auth)/jobs/[id]/job-master-view.svelte -->
<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Card, CardContent } from '$lib/components/ui/card'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Label } from '$lib/components/ui/label'
  import { Separator } from '$lib/components/ui/separator'
  import {
    ArrowLeft,
    MapPin,
    Clock,
    Eye,
    MessageSquare,
    Star,
    XCircle,
    Send,
  } from 'lucide-svelte'
  import type { PageData } from './$types'
  import { Spinner } from '$lib/components/ui/spinner'
  import { describeJob } from '$lib/categories/cleaning/describe'
  import PhotoGallery from '$lib/components/photo-gallery.svelte'
  import {
    formatMoney,
    formatRelative,
    expiresIn,
    memberSince,
    initials,
    statusVariant,
    statusLabel,
    proposalStatusLabel,
    proposalStatusVariant,
  } from '$lib/components/jobs/display'

  let { data }: { data: PageData } = $props()

  const details = $derived(describeJob(data.job.metadata))

  // ─── Форма відгуку ───
  let formOpen = $state(false)
  let message = $state('')
  let priceUah = $state<number | ''>('')
  let estimatedDays = $state<number | ''>('')
  let submitting = $state(false)
  let errorMsg = $state<string | null>(null)

  // Дзеркало серверних меж (клієнтська перевірка — лише для UX).
  const messageLen = $derived(message.trim().length)
  const canSubmit = $derived(
    !submitting &&
      messageLen >= 20 &&
      messageLen <= 2000 &&
      typeof priceUah === 'number' &&
      priceUah >= 50 &&
      priceUah <= 500_000 &&
      typeof estimatedDays === 'number' &&
      estimatedDays >= 1 &&
      estimatedDays <= 180,
  )

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
</script>

<!-- Back -->
<button
  type="button"
  onclick={() => goto('/jobs')}
  class="inline-flex items-center gap-1.5 text-sm mb-5 cursor-pointer hover:opacity-70 transition-opacity"
  style="color: var(--muted-foreground)"
>
  <ArrowLeft class="size-4" /> До списку
</button>

<!-- Header card -->
<Card class="rounded-2xl mb-3">
  <CardContent class="p-5 sm:p-6">
    <div class="flex items-center gap-2 flex-wrap mb-3">
      <Badge
        variant={statusVariant(data.job.status)}
        class="text-[10px] uppercase font-bold"
      >
        {statusLabel(data.job.status)}
      </Badge>
      <span class="text-xs" style="color: var(--muted-foreground)">
        {formatRelative(data.job.createdAt)}
      </span>
      {#if data.job.status === 'OPEN'}
        <span class="text-xs" style="color: var(--muted-foreground)">
          · Активна ще {expiresIn(data.job.expiresAt)}
        </span>
      {/if}
    </div>

    <h1
      class="text-xl sm:text-2xl font-bold tracking-tight mb-3"
      style="color: var(--foreground); letter-spacing: -0.02em"
    >
      {data.job.title}
    </h1>

    {#if data.job.description}
      <p
        class="text-sm leading-relaxed whitespace-pre-wrap mb-4"
        style="color: var(--foreground)"
      >
        {data.job.description}
      </p>
    {/if}

    <!-- Характеристики заявки -->
    {#if details.length > 0}
      <div class="rounded-xl border border-border overflow-hidden mb-4">
        {#each details as d, i (d.label)}
          {#if d.items}
            <div
              class="px-4 py-3 text-sm"
              class:border-t={i > 0}
              style="border-color: var(--border)"
            >
              <span class="block mb-2.5" style="color: var(--muted-foreground)"
                >{d.label}</span
              >
              <div class="space-y-2">
                {#each d.items as it (it.name)}
                  <div class="flex items-center justify-between gap-3">
                    <span class="font-medium" style="color: var(--foreground)"
                      >{it.name}</span
                    >
                    <span
                      class="shrink-0 inline-flex items-center justify-center min-w-7 h-6 px-2 rounded-full text-xs font-semibold tabular-nums"
                      style="background-color: var(--secondary); color: var(--foreground)"
                    >
                      ×{it.qty}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            <div
              class="flex items-center justify-between px-4 py-2.5 text-sm gap-4"
              class:border-t={i > 0}
              style="border-color: var(--border)"
            >
              <span class="shrink-0" style="color: var(--muted-foreground)"
                >{d.label}</span
              >
              <span
                class="font-medium text-right"
                style="color: var(--foreground)"
              >
                {d.value}
              </span>
            </div>
          {/if}
        {/each}
      </div>
    {/if}

    <!-- Фото обсягу робіт -->
    {#if data.job.attachments && data.job.attachments.length > 0}
      <div class="mb-4">
        <PhotoGallery images={data.job.attachments} />
      </div>
    {/if}

    <!-- Місто -->
    <div
      class="flex items-center gap-1.5 text-sm mb-4"
      style="color: var(--muted-foreground)"
    >
      <MapPin class="size-3.5" />
      {data.job.city}
    </div>

    <Separator class="my-4" />

    <div
      class="flex items-center gap-4 text-xs"
      style="color: var(--muted-foreground)"
    >
      <span class="inline-flex items-center gap-1">
        <MessageSquare class="size-3.5" />
        {data.job.proposalsCount} пропозиц{data.job.proposalsCount === 1
          ? 'ія'
          : 'ій'}
      </span>
      <span class="inline-flex items-center gap-1">
        <Eye class="size-3.5" />
        {data.job.viewsCount}
      </span>
    </div>
  </CardContent>
</Card>

<!-- Client card -->
<Card class="rounded-2xl mb-3">
  <CardContent class="p-4 sm:p-5">
    <p
      class="text-[11px] font-semibold uppercase tracking-widest mb-3"
      style="color: var(--muted-foreground)"
    >
      Замовник
    </p>
    <a
      href="/client/{data.job.client.id}"
      class="flex items-center gap-3 group"
    >
      <Avatar class="size-11">
        <AvatarImage
          src={data.job.client.avatar ?? ''}
          alt={data.job.client.name ?? ''}
        />
        <AvatarFallback class="text-base font-semibold">
          {initials(data.job.client.name)}
        </AvatarFallback>
      </Avatar>
      <div class="min-w-0 flex-1">
        <p
          class="text-sm font-semibold group-hover:underline"
          style="color: var(--foreground)"
        >
          {data.job.client.name ?? 'Замовник'}
        </p>
        <div
          class="flex items-center gap-2 text-xs mt-0.5"
          style="color: var(--muted-foreground)"
        >
          {#if data.job.client.reviewsCount > 0}
            <span class="inline-flex items-center gap-1">
              <Star class="size-3" style="color: #f5a623; fill: #f5a623" />
              {data.job.client.avgRating.toFixed(1)} ({data.job.client
                .reviewsCount})
            </span>
            <span>·</span>
          {/if}
          <span>З {memberSince(data.job.client.createdAt)}</span>
        </div>
      </div>
    </a>
  </CardContent>
</Card>

<!-- Action area -->
{#if data.proposals.length > 0}
  <!-- Майстер уже подав пропозицію -->
  {#each data.proposals as p (p.id)}
    <Card class="rounded-2xl mb-3">
      <CardContent class="p-5">
        <div class="flex items-center justify-between mb-3">
          <p
            class="text-[11px] font-semibold uppercase tracking-widest"
            style="color: var(--muted-foreground)"
          >
            Ваша пропозиція
          </p>
          <Badge
            variant={proposalStatusVariant(p.status)}
            class="text-[10px] uppercase"
          >
            {proposalStatusLabel(p.status)}
          </Badge>
        </div>

        <p
          class="text-sm leading-relaxed mb-4 whitespace-pre-wrap"
          style="color: var(--foreground)"
        >
          {p.message}
        </p>

        <Separator class="my-3" />

        <div
          class="flex items-center gap-3 text-xs"
          style="color: var(--muted-foreground)"
        >
          <span class="inline-flex items-center gap-1">
            <Clock class="size-3.5" />
            {p.estimatedDays} дн
          </span>
          <span>·</span>
          <span
            class="font-semibold tabular-nums"
            style="color: var(--foreground)"
          >
            {formatMoney(p.priceCents, data.job.currency)}
          </span>
          <span class="ml-auto">{formatRelative(p.createdAt)}</span>
        </div>
      </CardContent>
    </Card>
  {/each}
{:else if data.canPropose}
  <Card class="rounded-2xl">
    <CardContent class="p-5 sm:p-6">
      {#if !formOpen}
        <div class="text-center py-2">
          <div
            class="size-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
            style="background-color: var(--secondary)"
          >
            <Send class="size-5" style="color: var(--foreground)" />
          </div>
          <p class="text-base font-bold mb-1" style="color: var(--foreground)">
            Зацікавила заявка?
          </p>
          <p
            class="text-sm mb-4 max-w-xs mx-auto"
            style="color: var(--muted-foreground)"
          >
            Запропонуйте ціну та термін — клієнт одразу отримає сповіщення
          </p>
          <Button
            onclick={() => (formOpen = true)}
            class="rounded-full gap-2 h-11 px-6 font-semibold"
          >
            <Send class="size-4" /> Подати пропозицію
          </Button>
        </div>
      {:else}
        <div class="space-y-5">
          <!-- Ціна — великий акцентний інпут -->
          <div>
            <Label
              for="proposal-price"
              class="text-sm font-semibold mb-2 block"
            >
              Ваша ціна
            </Label>
            <div
              class="flex items-center gap-2 rounded-2xl border px-4 h-16 transition-colors focus-within:border-foreground"
              style="border-color: var(--border); background-color: var(--secondary)"
            >
              <input
                id="proposal-price"
                type="number"
                bind:value={priceUah}
                min={50}
                max={500000}
                placeholder="0"
                class="flex-1 min-w-0 bg-transparent outline-none text-3xl font-bold tabular-nums"
                style="color: var(--foreground)"
              />
              <span
                class="text-2xl font-bold shrink-0"
                style="color: var(--muted-foreground)">₴</span
              >
            </div>
          </div>

          <!-- Термін -->
          <div>
            <Label for="proposal-days" class="text-sm font-semibold mb-2 block">
              Термін виконання
            </Label>
            <div
              class="flex items-center gap-2 rounded-xl border px-4 h-12"
              style="border-color: var(--border)"
            >
              <input
                id="proposal-days"
                type="number"
                bind:value={estimatedDays}
                min={1}
                max={180}
                placeholder="3"
                class="flex-1 min-w-0 bg-transparent outline-none text-base font-medium tabular-nums"
                style="color: var(--foreground)"
              />
              <span
                class="text-sm shrink-0"
                style="color: var(--muted-foreground)">днів</span
              >
            </div>
          </div>

          <!-- Повідомлення -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <Label for="proposal-msg" class="text-sm font-semibold">
                Повідомлення клієнту
              </Label>
              <span
                class="text-[11px] tabular-nums"
                style="color: {messageLen < 20 || messageLen > 2000
                  ? 'var(--destructive)'
                  : 'var(--muted-foreground)'}"
              >
                {messageLen} / 2000
              </span>
            </div>
            <Textarea
              id="proposal-msg"
              bind:value={message}
              rows={4}
              placeholder="Розкажіть, як виконаєте роботу. Що входить, які матеріали, досвід. Мінімум 20 символів."
              class="resize-none"
            />
          </div>

          {#if errorMsg}
            <div
              class="text-sm flex items-start gap-2 rounded-xl px-3 py-2.5"
              style="background-color: color-mix(in srgb, var(--destructive) 10%, transparent); color: var(--destructive)"
            >
              <XCircle class="size-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          {/if}

          <div class="flex items-center gap-2">
            <Button
              variant="ghost"
              onclick={() => {
                formOpen = false
                errorMsg = null
              }}
              disabled={submitting}
              class="rounded-full"
            >
              Скасувати
            </Button>
            <Button
              onclick={submitProposal}
              disabled={!canSubmit}
              class="flex-1 rounded-full gap-2 h-12 text-base font-semibold"
            >
              {#if submitting}
                <Spinner /> Відправляємо…
              {:else}
                <Send class="size-4" /> Відправити відгук
              {/if}
            </Button>
          </div>
        </div>
      {/if}
    </CardContent>
  </Card>
{/if}
