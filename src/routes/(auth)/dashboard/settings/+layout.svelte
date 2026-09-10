<script lang="ts">
  // Налаштування — модалка поверх дашборда, а не окремий екран
  // (див. `dashboard/settings-dialog.svelte`). Маршрути при цьому
  // лишились справжніми: сюди веде і пряме посилання, і повернення
  // після логіну (`requireUser(locals, '/dashboard/settings/...')`),
  // і завантажувачі розділів працюють саме звідси.
  //
  // Тому цей лейаут нічого не малює власного: він передає керування
  // модалці на потрібному розділі й повертає користувача на дашборд —
  // тобто на той самий екран, який буде під модалкою.
  //
  // Розмітка нижче — тільки для тієї частки секунди до гідратації
  // (і для випадку без JS), щоб сторінка не була порожньою.

  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { settingsDialog } from '$lib/stores/settings-dialog.svelte'
  import { DEFAULT_SECTION } from '$lib/components/settings'

  let { children } = $props()

  let handedOver = $state(false)

  onMount(() => {
    const slug =
      page.url.pathname.split('/').filter(Boolean).at(-1) ?? DEFAULT_SECTION

    settingsDialog.show(slug)
    handedOver = true

    // replaceState: «назад» має вести туди, звідки прийшли, а не
    // по колу в той самий розділ налаштувань.
    goto('/dashboard', { replaceState: true })
  })
</script>

<svelte:head><title>Налаштування · Zunor</title></svelte:head>

{#if !handedOver}
  <div class="mx-auto w-full max-w-2xl px-4 py-8">
    <h1 class="mb-5 text-xl font-semibold tracking-[-0.02em]">Налаштування</h1>
    {@render children()}
  </div>
{/if}
