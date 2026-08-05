<!-- src/lib/components/orders/order-actions.svelte -->
<script lang="ts">
  import { invalidateAll, goto } from '$app/navigation'
  import toast from 'svelte-hot-french-toast'
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
  import * as AlertDialog from '$lib/components/ui/alert-dialog'

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

  // Dialog state
  let cancelOpen = $state(false)
  let cancelReason = $state('')
  let startOpen = $state(false)
  let completeOpen = $state(false)

  /**
   * Підтвердження успіху. Статус на сторінці й так оновиться, але це
   * події, навколо яких крутяться гроші й домовленість — людина має
   * почути, що саме щойно сталося, а не звіряти плашку очима.
   * Помилки лишаються під кнопками: там на них дивляться, коли щось пішло
   * не так, і вони не зникають за чотири секунди.
   */
  const DONE_MESSAGE: Record<'start' | 'complete' | 'cancel', string> = {
    start: 'Роботу розпочато',
    complete: 'Роботу завершено — залиште відгук про співпрацю',
    cancel: 'Замовлення скасовано',
  }

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

      // Скасування — не привід святкувати, тому нейтральний тост.
      if (action === 'cancel') toast(DONE_MESSAGE.cancel)
      else toast.success(DONE_MESSAGE[action])
    } catch (err) {
      error = err instanceof Error ? err.message : 'Помилка'
    } finally {
      loading = null
    }
  }

  async function start() {
    startOpen = false
    await callAction('start')
  }

  async function complete() {
    completeOpen = false
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
    if (chatId) goto(`/dashboard/messages/${chatId}`)
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
      <Button onclick={() => (startOpen = true)} disabled={loading !== null}>
        {#if loading === 'start'}
          <Loader2 class="size-4 animate-spin" />
        {:else}
          <Play class="size-4" />
        {/if}
        Розпочати роботу
      </Button>
    {/if}

    {#if canComplete}
      <Button onclick={() => (completeOpen = true)} disabled={loading !== null}>
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
    class="flex items-center gap-2 mt-3 p-3 rounded-xl text-sm"
    style="background-color: var(--destructive-foreground); color: var(--destructive)"
  >
    <AlertCircle class="size-4 shrink-0" />
    {error}
  </div>
{/if}

<!-- Start dialog -->
<AlertDialog.Root bind:open={startOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Розпочати роботу?</AlertDialog.Title>
      <AlertDialog.Description>
        Клієнт побачить, що ти взявся за замовлення.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={loading === 'start'}
        >Не зараз</AlertDialog.Cancel
      >
      <AlertDialog.Action onclick={start} disabled={loading === 'start'}>
        Так, починаю
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<!-- Complete dialog -->
<AlertDialog.Root bind:open={completeOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Завершити замовлення?</AlertDialog.Title>
      <AlertDialog.Description>
        Після завершення ви зможете залишити відгуки один про одного.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={loading === 'complete'}
        >Не зараз</AlertDialog.Cancel
      >
      <AlertDialog.Action onclick={complete} disabled={loading === 'complete'}>
        Так, завершити
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

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
