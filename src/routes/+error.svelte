<!-- src/routes/+error.svelte
     Корневой error boundary. Рендерится всегда, когда:
       - роут не совпал (автоматический 404), либо
       - error(status, ...) всплыл сюда из любого load/handler.
     Отрисовывается внутри корневого +layout.svelte. -->
<script lang="ts">
  import { page } from '$app/state'

  const isNotFound = $derived(page.status === 404)

  // Только generic-текст для пользователя. page.error — App.Error | null,
  // его message для 5xx намеренно не показываем (может утечь деталь).
  const message = $derived(
    isNotFound
      ? 'Такой страницы не существует или она была перемещена.'
      : 'Что-то пошло не так. Обновите страницу или вернитесь позже.',
  )
</script>

<svelte:head>
  <title>{page.status} — {isNotFound ? 'Страница не найдена' : 'Ошибка'}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main
  class="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
>
  <p class="text-6xl font-bold tabular-nums text-gray-400" aria-hidden="true">
    {page.status}
  </p>
  <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">
    {isNotFound ? 'Страница не найдена' : 'Ошибка'}
  </h1>
  <p class="text-gray-600 dark:text-gray-400">{message}</p>
  <a
    href="/"
    class="mt-2 rounded-md bg-gray-900 px-4 py-2 font-medium text-white transition-colors hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
  >
    На главную
  </a>
</main>
