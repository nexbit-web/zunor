<script lang="ts">
  // Сторінка помилки — у тій самій подачі, що вхід і вибір ролі: відсвіт
  // угорі, колонка по центру, заголовок 18px і рядок 14px сірим. Шапку й
  // підвал лендингу кореневий лейаут тут ховає.
  //
  // 404 — знак, що тягне табличку «404»; будь-яка інша помилка — знак зі
  // знаками питання: «404» на табличці там була б неправдою.
  import { page } from '$app/state'
  import { ZunorMarkAnimated } from '$lib/components/icons'
  import LottiePlayer from '$lib/components/lottie-player.svelte'
  import PastelGlow from '$lib/components/pastel-glow.svelte'
  import { Button } from '$lib/components/ui/button'

  const isNotFound = $derived(page.status === 404)

  const title = $derived(
    isNotFound ? 'Такої сторінки немає' : 'Щось пішло не так',
  )

  const message = $derived(
    isNotFound
      ? 'Можливо, посилання застаріло або в адресі закралась помилка.'
      : 'Спробуйте оновити сторінку за хвилину або поверніться на головну.',
  )
</script>

<svelte:head>
  <title>{title} · Zunor</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="relative flex min-h-svh flex-col bg-background">
  <PastelGlow />

  <main
    class="relative flex flex-1 flex-col items-center justify-center px-5 pt-12 pb-8 text-center"
  >
    {#if isNotFound}
      <LottiePlayer
        src="/animations/zunor-404-lift.json"
        monochrome
        class="aspect-1100/1110 w-60 text-foreground sm:w-72"
      />
    {:else}
      <!-- mt-10 — місце під знаки питання: вони виходять за межі знака. -->
      <ZunorMarkAnimated
        animation="puzzled"
        class="mt-10 h-16 text-foreground"
      />
    {/if}

    <h1 class="mt-5 mb-1 text-[18px] leading-tight font-semibold">
      {title}
    </h1>
    <p class="max-w-80 text-[14px] leading-normal text-muted-foreground">
      {message}
    </p>

    <Button href="/" variant="primary" size="lg" class="mt-6 min-w-40">
      На головну
    </Button>
  </main>
</div>
