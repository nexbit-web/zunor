<script lang="ts">
  // Кнопка відкриття панелі на телефоні й планшеті.
  //
  // На вузькому екрані панель — шторка, тобто закрита за замовчуванням, і
  // все непрочитане ховається разом із нею. Тому лічильник винесено на
  // саму кнопку: інакше про нове повідомлення можна дізнатись, лише
  // відкривши меню навмання.
  //
  // Число — СУМА повідомлень і сповіщень. Розділяти їх тут нема куди, а
  // показувати лише одне з двох означало б тихо ховати друге.
  //
  // Плаваюча, а не в шапці: окремої шапки на дашборді немає, а заводити
  // цілу смугу заради однієї кнопки — це мінус рядок контенту на кожному
  // екрані телефона.

  import MenuIcon from '@lucide/svelte/icons/menu'
  import { useSidebar } from '$lib/components/ui/sidebar/index.js'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import { notifications } from '$lib/notifications'

  const sidebar = useSidebar()

  const total = $derived(chatStore.totalUnread + notifications.unreadCount)
</script>

<button
  type="button"
  onclick={() => sidebar.setOpenMobile(true)}
  aria-label={total > 0
    ? `Відкрити меню — ${total} непрочитаних`
    : 'Відкрити меню'}
  class="trigger fixed start-3 top-3 z-40 flex size-10 items-center justify-center rounded-full border border-border bg-background text-foreground md:hidden"
>
  <MenuIcon size={18} strokeWidth={2} aria-hidden="true" />

  {#if total > 0}
    <span
      class="absolute -end-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-bold text-white ring-2 ring-background"
      aria-hidden="true"
    >
      {total > 9 ? '9+' : total}
    </span>
  {/if}
</button>

<style>
  .trigger {
    box-shadow: 0 4px 14px -4px rgb(0 0 0 / 0.18);
    transition: background-color 150ms ease;
  }

  .trigger:hover,
  .trigger:focus-visible {
    background-color: var(--accent);
  }
</style>
