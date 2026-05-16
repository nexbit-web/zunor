<!-- src/lib/components/jobs/proposal-form.svelte -->
<script lang="ts">
  import { invalidateAll } from '$app/navigation'
  import { Loader2, AlertTriangle, Wallet } from 'lucide-svelte'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Button } from '$lib/components/ui/button'

  interface Props {
    jobId: string
    walletBalanceCents: number
    leadFeeCents: number
    /** Suggestion ціни (з budget job) */
    suggestedPriceUah?: number | null
    /** Suggestion днів (з deliveryDays job) */
    suggestedDays?: number | null
  }

  let {
    jobId,
    walletBalanceCents,
    leadFeeCents,
    suggestedPriceUah = null,
    suggestedDays = null,
  }: Props = $props()

  let coverLetter = $state('')
  let priceUah = $state(suggestedPriceUah ? String(suggestedPriceUah) : '')
  let days = $state(suggestedDays ? String(suggestedDays) : '')
  let submitting = $state(false)
  let error = $state('')

  const insufficientBalance = $derived(walletBalanceCents < leadFeeCents)

  function formatMoney(cents: number): string {
    return new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency: 'UAH',
      minimumFractionDigits: 0,
    }).format(cents / 100)
  }

  async function submit() {
    if (submitting) return
    error = ''

    if (coverLetter.trim().length < 30) {
      error = 'Мотиваційний лист: мінімум 30 символів'
      return
    }
    const price = Number(priceUah)
    if (!Number.isFinite(price) || price < 100) {
      error = 'Ціна: мінімум 100 грн'
      return
    }
    const d = Number(days)
    if (!Number.isInteger(d) || d < 1 || d > 180) {
      error = 'Термін: 1-180 днів'
      return
    }

    submitting = true
    try {
      const res = await fetch(`/api/jobs/${jobId}/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coverLetter: coverLetter.trim(),
          proposedPriceUah: price,
          proposedDays: d,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message ?? 'Помилка')
      }
      // Успіх — invalidate щоб перезавантажилися proposal/data
      await invalidateAll()
      coverLetter = ''
    } catch (err) {
      error = err instanceof Error ? err.message : 'Помилка'
    } finally {
      submitting = false
    }
  }
</script>

<div
  class="rounded-xl p-5"
  style="background-color: var(--card); border: 1px solid var(--border)"
>
  <h3 class="text-base font-semibold mb-1" style="color: var(--foreground)">
    Відгукнутись на заявку
  </h3>
  <p class="text-xs mb-4" style="color: var(--muted-foreground)">
    Відправте мотиваційний лист, ціну і термін. Клієнт побачить ваше portfolio.
  </p>

  <!-- Lead fee notice -->
  <div
    class="flex items-start gap-2 rounded-lg p-3 mb-4"
    style="background-color: {insufficientBalance
      ? 'color-mix(in srgb, var(--destructive) 10%, transparent)'
      : 'var(--muted)'};
           border: 1px solid {insufficientBalance
      ? 'var(--destructive)'
      : 'var(--border)'}"
  >
    <Wallet
      class="size-4 shrink-0 mt-0.5"
      style="color: {insufficientBalance
        ? 'var(--destructive)'
        : 'var(--muted-foreground)'}"
    />
    <div class="flex-1 min-w-0">
      <p
        class="text-xs font-medium"
        style="color: {insufficientBalance
          ? 'var(--destructive)'
          : 'var(--foreground)'}"
      >
        {#if insufficientBalance}
          Недостатньо коштів на балансі
        {:else}
          Лід за відгук — {formatMoney(leadFeeCents)}
        {/if}
      </p>
      <p class="text-[11px] mt-0.5" style="color: var(--muted-foreground)">
        Баланс: <span class="tabular-nums"
          >{formatMoney(walletBalanceCents)}</span
        >.
        {#if insufficientBalance}
          <a href="/dashboard/wallet" class="underline"> Поповнити </a>
        {/if}
      </p>
    </div>
  </div>

  <div class="space-y-4">
    <div>
      <label
        for="cover-letter"
        class="text-xs font-medium block mb-1.5"
        style="color: var(--muted-foreground)"
      >
        Мотиваційний лист
      </label>
      <Textarea
        id="cover-letter"
        bind:value={coverLetter}
        rows={6}
        placeholder="Розкажіть чому ви підходите для цієї задачі. Приклади схожих робіт, ваш досвід, як плануєте виконати."
        maxlength={5000}
      />
      <p class="text-[10px] mt-1" style="color: var(--muted-foreground)">
        {coverLetter.length}/5000 (мін. 30)
      </p>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label
          for="price"
          class="text-xs font-medium block mb-1.5"
          style="color: var(--muted-foreground)"
        >
          Ваша ціна, ₴
        </label>
        <Input
          id="price"
          type="number"
          bind:value={priceUah}
          min={100}
          max={50000}
          placeholder="2000"
        />
      </div>
      <div>
        <label
          for="days"
          class="text-xs font-medium block mb-1.5"
          style="color: var(--muted-foreground)"
        >
          Термін, днів
        </label>
        <Input
          id="days"
          type="number"
          bind:value={days}
          min={1}
          max={180}
          placeholder="7"
        />
      </div>
    </div>

    {#if error}
      <p
        class="text-xs rounded-lg px-3 py-2"
        style="background-color: color-mix(in srgb, var(--destructive) 10%, transparent);
               color: var(--destructive)"
      >
        {error}
      </p>
    {/if}

    <Button
      class="w-full"
      onclick={submit}
      disabled={submitting || insufficientBalance}
    >
      {#if submitting}
        <Loader2 class="size-4 mr-1 animate-spin" />
        Відправлення…
      {:else}
        Відгукнутись та оплатити лід
      {/if}
    </Button>
  </div>
</div>
