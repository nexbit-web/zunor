<!--
  «Поскаржитися» — один діалог на всі місця: замовлення, чат, профіль,
  заявка. Причина — зі спільного набору ($lib/reports/reasons), пояснення
  — за бажанням (для «Інше» — обовʼязкове). Скаргу розглядає модератор у
  CRM; людина, на яку скаржаться, сповіщення про неї не отримує.

  Після надсилання форма зникає — тож тост обовʼязковий (AGENTS, «Коли
  тост потрібен»): інакше успіх виглядав би так само, як збій, що стер
  написане. Помилка — під формою, а не в тості.
-->
<script lang="ts">
  import toast from 'svelte-hot-french-toast'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as RadioGroup from '$lib/components/ui/radio-group'
  import { Button } from '$lib/components/ui/button'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Spinner } from '$lib/components/ui/spinner'
  import CircleAlert from '$lib/components/icons/set/circle-alert.svelte'
  import {
    reasonsFor,
    OTHER_MIN_LENGTH,
    TEXT_MAX_LENGTH,
    type ReportReason,
  } from '$lib/reports/reasons'

  interface Props {
    open: boolean
    targetId: string
    /** Імʼя в описі: «Олена не отримає сповіщення про неї». */
    targetName: string | null
    /** Від ролі залежить набір причин («погано прибрав» — лише майстру). */
    targetRole: 'MASTER' | 'CLIENT'
    /** Де це сталось — модератор відкриє контекст одним кліком. */
    context?: { orderId?: string; chatId?: string; jobId?: string }
  }

  let {
    open = $bindable(false),
    targetId,
    targetName,
    targetRole,
    context = {},
  }: Props = $props()

  const reasons = $derived(reasonsFor(targetRole))

  let reason = $state<ReportReason | ''>('')
  let text = $state('')
  let sending = $state(false)
  let errorText = $state('')

  const needsText = $derived(reason === 'other')
  const canSend = $derived(
    !!reason &&
      !sending &&
      (!needsText || text.trim().length >= OTHER_MIN_LENGTH),
  )

  // Кожне відкриття — з чистого аркуша: недописана скарга на іншу людину
  // тут не потрібна. Скидаємо, коли діалог уже зник, — не під час
  // анімації закриття, щоб форма не мигнула порожньою.
  function reset(isOpen: boolean): void {
    if (isOpen) return
    reason = ''
    text = ''
    errorText = ''
  }

  async function send(e?: SubmitEvent): Promise<void> {
    e?.preventDefault()
    if (!canSend) return
    sending = true
    errorText = ''

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetId, reason, text, ...context }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          message?: string
        } | null
        errorText = j?.message ?? 'Не вдалося надіслати скаргу'
        return
      }
      open = false
      toast.success('Дякуємо. Ми розглянемо скаргу.')
    } catch {
      errorText = "Помилка з'єднання. Перевірте інтернет."
    } finally {
      sending = false
    }
  }
</script>

<Dialog.Root bind:open onOpenChangeComplete={reset}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <!-- Імʼя — у називному відмінку на початку речення: «Скарга на
           Олена» читалось би з помилкою, а відмінювати імена ми не вміємо. -->
      <Dialog.Title>Поскаржитися</Dialog.Title>
      <Dialog.Description>
        Скаргу розгляне модератор. {targetName || 'Ця людина'} не отримає
        сповіщення про неї.
      </Dialog.Description>
    </Dialog.Header>

    <form id="report-form" class="flex flex-col gap-4" onsubmit={send}>
      <RadioGroup.Root
        bind:value={
          () => reason, (v) => (reason = v as ReportReason)
        }
        class="-mx-1 gap-0.5"
        aria-label="Причина скарги"
      >
        {#each reasons as r (r.key)}
          <label
            class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[14.5px] transition-colors hover:bg-muted/60"
          >
            <RadioGroup.Item value={r.key} />
            {r.label}
          </label>
        {/each}
      </RadioGroup.Root>

      <div class="flex flex-col gap-1.5">
        <Textarea
          bind:value={text}
          rows={3}
          maxlength={TEXT_MAX_LENGTH}
          placeholder={needsText
            ? 'Опишіть, що сталося'
            : 'Що сталося? (необовʼязково)'}
          aria-label="Подробиці"
        />
        {#if errorText}
          <p
            class="flex items-center gap-1.5 text-[12px] text-destructive"
            role="alert"
          >
            <CircleAlert class="size-3.5 shrink-0" aria-hidden="true" />
            {errorText}
          </p>
        {/if}
      </div>
    </form>

    <Dialog.Footer>
      <Button variant="secondary" onclick={() => (open = false)}>
        Скасувати
      </Button>
      <Button
        type="submit"
        form="report-form"
        disabled={!canSend}
        aria-busy={sending}
      >
        {#if sending}
          <Spinner class="animate-spin" aria-hidden="true" />
        {/if}
        Надіслати
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
