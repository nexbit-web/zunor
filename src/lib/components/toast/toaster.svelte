<script lang="ts">
  import {
    toastStore,
    type ToastPosition,
  } from '$lib/stores/toast-store.svelte'
  import ToastItem from './toast-item.svelte'

  let { position = 'top-right' }: { position?: ToastPosition } = $props()

  // Позиція за замовчуванням для toast(...) без явної position
  $effect(() => {
    toastStore.defaultPosition = position
  })

  const ALL: ToastPosition[] = [
    'top-left',
    'top-center',
    'top-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
  ]

  // Прив'язка контейнера до кута. Нижні позиції — flex-col-reverse:
  // новий тост біля краю, старі плавно повзуть углиб.
  const POS_CLASS: Record<ToastPosition, string> = {
    'top-left': 'top-15 left-4 items-start',
    'top-center': 'top-5 left-1/2 -translate-x-1/2 items-center',
    'top-right': 'top-15 right-4 items-end',
    'bottom-left': 'bottom-4 left-4 items-start flex-col-reverse',
    'bottom-center':
      'bottom-4 left-1/2 -translate-x-1/2 items-center flex-col-reverse',
    'bottom-right': 'bottom-4 right-4 items-end flex-col-reverse',
  }

  const grouped = $derived(
    ALL.map((p) => ({
      position: p,
      items: toastStore.items.filter((t) => t.position === p),
    })).filter((g) => g.items.length > 0),
  )
</script>

{#each grouped as group (group.position)}
  <ol
    class="fixed z-[100] flex flex-col gap-3 pointer-events-none w-[calc(100vw-2rem)] max-w-[440px] {POS_CLASS[
      group.position
    ]}"
    aria-live="polite"
    aria-atomic="false"
  >
    {#each group.items as item (item.id)}
      <ToastItem {item} />
    {/each}
  </ol>
{/each}
