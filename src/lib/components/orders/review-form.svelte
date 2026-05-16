<!-- src/lib/components/orders/review-form.svelte -->
<script lang="ts">
  import { invalidateAll } from '$app/navigation'
  import { Star, Loader2 } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import { Textarea } from '$lib/components/ui/textarea'

  interface Props {
    orderId: string
    /** Кого ми оцінюємо: 'майстра' (клієнт пише про фрілансера) або 'клієнта' (фрілансер пише про клієнта) */
    peerLabel: string
    /** Ім'я peer для повідомлень */
    peerName?: string
  }

  let { orderId, peerLabel, peerName = '' }: Props = $props()

  let rating = $state(0)
  let hover = $state(0)
  let comment = $state('')
  let submitting = $state(false)
  let error = $state('')

  async function submit() {
    if (rating === 0) {
      error = 'Оберіть рейтинг'
      return
    }

    submitting = true
    error = ''
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          rating,
          comment: comment.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message ?? 'Помилка')
      }
      await invalidateAll()
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
    Залишити відгук про {peerLabel}
  </h3>
  <p class="text-xs mb-4" style="color: var(--muted-foreground)">
    {#if peerName}
      Оцініть співпрацю з <strong>{peerName}</strong>. Це допоможе іншим.
    {:else}
      Оцініть співпрацю. Це допоможе іншим.
    {/if}
  </p>

  <!-- Stars -->
  <div class="flex items-center gap-1 mb-4">
    {#each [1, 2, 3, 4, 5] as i}
      {@const filled = (hover || rating) >= i}
      <button
        type="button"
        onmouseenter={() => (hover = i)}
        onmouseleave={() => (hover = 0)}
        onclick={() => (rating = i)}
        class="size-9 rounded cursor-pointer transition-transform hover:scale-110"
      >
        <Star
          class="size-7 mx-auto"
          style="color: {filled ? '#f59e0b' : 'var(--border)'};
                 fill: {filled ? '#f59e0b' : 'transparent'}"
        />
      </button>
    {/each}
    <span
      class="ml-2 text-sm font-medium tabular-nums"
      style="color: var(--muted-foreground)"
    >
      {rating > 0 ? `${rating}/5` : 'Оцініть'}
    </span>
  </div>

  <Textarea
    bind:value={comment}
    rows={4}
    placeholder="Розкажіть як пройшла співпраця. Це допоможе іншим..."
    maxlength={2000}
    class="mb-3"
  />

  {#if error}
    <p
      class="text-xs mb-3 rounded-lg px-3 py-2"
      style="background-color: color-mix(in srgb, var(--destructive) 10%, transparent);
             color: var(--destructive)"
    >
      {error}
    </p>
  {/if}

  <Button onclick={submit} disabled={submitting || rating === 0} class="w-full">
    {#if submitting}
      <Loader2 class="size-4 mr-1 animate-spin" />
      Відправлення…
    {:else}
      Залишити відгук
    {/if}
  </Button>
</div>
