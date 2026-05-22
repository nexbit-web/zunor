<script lang="ts">
  import HeroSection from '$lib/components/home/hero-section.svelte'
  import HowItWorks from '$lib/components/home/how-it-works.svelte'
</script>

<svelte:head>
  <title>Zunor — прибирання як від сусіда</title>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <meta
    name="description"
    content="Zunor — сервіс замовлення прибирання квартир, будинків та офісів в Одесі. Замов клінера за 4 кроки."
  />

  <meta property="og:title" content="Zunor — прибирання як від сусіда" />
  <meta
    property="og:description"
    content="Замов клінера в Одесі. Без анкет, без зайвих питань."
  />
  <meta property="og:type" content="website" />

  <link rel="icon" href="/favicon.ico" />
</svelte:head>

<HeroSection />
<HowItWorks />
