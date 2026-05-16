<!-- src/lib/components/orders/order-actions.svelte -->
<script lang="ts">
  import { invalidateAll, goto } from '$app/navigation'
  import {
    Play,
    Check,
    X,
    Loader2,
    AlertCircle,
    MessageCircle,
  } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import { Textarea } from '$lib/components/ui/textarea'
  import * as Dialog from '$lib/components/ui/dialog'

  interface Props {
    orderId: string
    status: 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
    isClient: boolean
    isMaster: boolean
    chatId: string | null
  }

  let { orderId, status, isClient, isMaster, chatId }: Props = $props()

  let loading = $state<string | null>(null)
  let error = $state('')

  // Cancel dialog state
  let cancelOpen = $state(false)
  let cancelReason = $state('')

  async function callAction(
    action: 'start' | 'complete' | 'cancel',
    body: any = {},
  ) {
    loading = action
    error = ''
    try {
      const res = await fetch(`/api/orders/${orderId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message ?? 'Помилка')
      }
      await invalidateAll()
    } catch (err) {
      error = err instanceof Error ? err.message : 'Помилка'
    } finally {
      loading = null
    }
  }

  async function start() {
    if (!confirm('Розпочати роботу над замовленням?')) return
    await callAction('start')
  }

  async function complete() {
    if (!confirm('Завершити замовлення? Клієнт зможе залишити відгук.')) return
    await callAction('complete')
  }

  async function cancel() {
    if (!cancelReason.trim() || cancelReason.length < 5) {
      error = 'Вкажіть причину (мінімум 5 символів)'
      return
    }
    await callAction('cancel', { reason: cancelReason.trim() })
    cancelOpen = false
    cancelReason = ''
  }

  function openChat() {
    if (chatId) goto(`/messages/${chatId}`)
  }

  // ─── Логіка кнопок ───
  const canStart = $derived(isMaster && status === 'CREATED')
  const canComplete = $derived(isMaster && status === 'IN_PROGRESS')
  const canCancel = $derived(
    (isMaster || isClient) &&
      (status === 'CREATED' || status === 'IN_PROGRESS'),
  )
  const isTerminal = $derived(status === 'COMPLETED' || status === 'CANCELLED')
</script>

{#if !isTerminal}
  <div class="flex flex-wrap items-center gap-2">
    {#if canStart}
      <Button onclick={start} disabled={loading !== null}>
        {#if loading === 'start'}
          <Loader2 class="size-4 animate-spin" />
        {:else}
          <Play class="size-4" />
        {/if}
        Розпочати роботу
      </Button>
    {/if}

    {#if canComplete}
      <Button onclick={complete} disabled={loading !== null}>
        {#if loading === 'complete'}
          <Loader2 class="size-4 animate-spin" />
        {:else}
          <Check class="size-4" />
        {/if}
        Завершити
      </Button>
    {/if}

    {#if chatId}
      <Button variant="outline" onclick={openChat}>
        <MessageCircle class="size-4" />
        Чат
      </Button>
    {/if}

    {#if canCancel}
      <Button
        variant="outline"
        onclick={() => (cancelOpen = true)}
        disabled={loading !== null}
      >
        <X class="size-4" />
        Скасувати
      </Button>
    {/if}
  </div>
{/if}

{#if error}
  <div
    class="flex items-center gap-2 mt-3 p-3 rounded-lg text-sm"
    style="background-color: var(--destructive-foreground); color: var(--destructive)"
  >
    <AlertCircle class="size-4 shrink-0" />
    {error}
  </div>
{/if}

<!-- Cancel dialog -->
<Dialog.Root bind:open={cancelOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Скасувати замовлення</Dialog.Title>
      <Dialog.Description>
        Це необоротна дія. Вкажіть причину — її побачить інша сторона.
      </Dialog.Description>
    </Dialog.Header>

    <Textarea
      bind:value={cancelReason}
      placeholder="Опишіть причину..."
      rows={4}
      maxlength={500}
    />

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (cancelOpen = false)}>
        Не зараз
      </Button>
      <Button onclick={cancel} disabled={loading === 'cancel'}>
        {#if loading === 'cancel'}
          <Loader2 class="size-4 animate-spin" />
        {/if}
        Підтвердити скасування
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
