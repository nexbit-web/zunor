<script lang="ts">
  import HeroSection from '$lib/components/home/hero-section.svelte'
  import CategoriesSection from '$lib/components/home/categories-section.svelte'
  import HowItWorks from '$lib/components/home/how-it-works.svelte'
</script>

<svelte:head>
  <title>Zunor.org — сервіс пошуку майстрів та фрилансерів</title>

  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <!-- SEO -->
  <meta
    name="description"
    content="Zunor — сучасна платформа для пошуку майстрів та фрилансерів в Україні. Замовляйте послуги швидко та безпечно."
  />

  <!-- Open Graph -->
  <meta property="og:title" content="Zunor" />
  <meta property="og:description" content="Знайди майстра або заробляй на своїх навичках" />
  <meta property="og:type" content="website" />

  <!-- Favicon -->
  <link rel="icon" href="/favicon.ico" />
</svelte:head>
<HeroSection />
<CategoriesSection />
<HowItWorks />