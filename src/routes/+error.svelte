<!-- src/routes/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state'
  import Ant404 from '$lib/components/Ant404.svelte'

  const isNotFound = $derived(page.status === 404)

  const message = $derived(
    isNotFound
      ? 'Такої сторінки не існує або її було переміщено.'
      : 'Щось пішло не так. Оновіть сторінку або поверніться пізніше.',
  )
</script>

<svelte:head>
  <title
    >{page.status} — {isNotFound ? 'Сторінку не знайдено' : 'Помилка'}</title
  >
  <meta name="robots" content="noindex" />
</svelte:head>

<main
  class="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-6 py-8 text-center lg:max-w-lg"
>
  <Ant404 class="w-51 sm:w-68 md:w-85" />

  <h1 class="sr-only">
    {page.status} — {isNotFound ? 'Сторінку не знайдено' : 'Помилка'}
  </h1>

  <p class="text-(--color-text-500) dark:text-gray-400">{message}</p>
  <a
    href="/"
    class="mt-2 rounded-xl bg-primary px-4 py-2 font-medium text-white transition-colors hover:bg-primary-hover"
  >
    На головну
  </a>
</main>
