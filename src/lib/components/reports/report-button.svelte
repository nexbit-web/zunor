<!--
  Тиха кнопка «Поскаржитися» з діалогом — для місць без меню дій
  (профілі). Скарга потрібна рідко, тож кнопка не кричить: сірий текст,
  червоніє лише під курсором.
-->
<script lang="ts">
  import Flag from '$lib/components/icons/set/flag.svelte'
  import ReportDialog from './report-dialog.svelte'

  interface Props {
    targetId: string
    targetName: string | null
    targetRole: 'MASTER' | 'CLIENT'
    context?: { orderId?: string; chatId?: string; jobId?: string }
    class?: string
  }

  let {
    targetId,
    targetName,
    targetRole,
    context,
    class: className = '',
  }: Props = $props()

  let open = $state(false)
</script>

<button
  type="button"
  onclick={() => (open = true)}
  class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring {className}"
>
  <Flag class="size-3.5" aria-hidden="true" />
  Поскаржитися
</button>

<ReportDialog bind:open {targetId} {targetName} {targetRole} {context} />
