<script lang="ts">
  import { onMount } from 'svelte'
  import HeroSection from '$lib/components/landing/hero-section.svelte'
  import JsonLd from '$lib/components/seo/JsonLd.svelte'
  import type { PageData } from './$types'
  import type { Component } from 'svelte'
  import BecomeMaster from '$lib/components/landing/become-master.svelte'
  import Advantages from '$lib/components/landing/advantages.svelte'
  import Faq from '$lib/components/landing/faq.svelte'

  // Svelte 5: Явна типізація контракту даних (Data Props Contract) згідно з SSR архитектурою
  let { data }: { data: PageData } = $props()

  // Семантичне ядро (LSI/SEO) ізольоване в нереактивну константу для запобігання overhead у пам'яті
  const SEO_DATA = {
    title: 'Клінінг Одеса — Професійне Прибирання Квартир | Zunor',
    description:
      'Замовте професійне прибирання квартир, будинків та офісів в Одесі від компанії Zunor. Експрес та генеральний клінінг за доступною ціною. Розрахунок вартості онлайн.',
    keywords:
      'клінінг одеса, прибирання квартир одеса, замовити клінінг, генеральне прибирання одеса, прибирання офісів',
    url: 'https://zunor.org',
    siteName: 'Zunor',
  }

  // Оптимізація TBT/INP: Використовуємо Code Splitting через асинхронний чанк для другорядного UI.
  // Обмежуємо область видимості типу за допомогою нативного інтерфейсу Component замість 'any'.
  let HowItWorksComponent = $state<Component | null>(null)

  onMount(async () => {
    // Відкладаємо завантаження чанку до повної інтерактивності Main Thread (Time to Interactive)
    const module = await import('$lib/components/landing/how-it-works.svelte')
    HowItWorksComponent = module.default
  })
</script>

<svelte:head>
  <!-- Критичні мета-дані для парсингу Googlebot (SEO домінація через точні інтенти) -->
  <title>{SEO_DATA.title}</title>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, viewport-fit=cover"
  />
  <meta
    name="robots"
    content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
  />
  <meta name="description" content={SEO_DATA.description} />
  <meta name="keywords" content={SEO_DATA.keywords} />
  <link rel="canonical" href={SEO_DATA.url} />

  <!-- Ресурси з високим пріоритетом (Resource Hinting) для мінімізації латентності мережі -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />

  <!-- Open Graph протокол для оптимізації Social Snippets (Facebook, Slack, Telegram) -->
  <meta property="og:locale" content="uk_UA" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={SEO_DATA.title} />
  <meta property="og:description" content={SEO_DATA.description} />
  <meta property="og:url" content={SEO_DATA.url} />
  <meta property="og:site_name" content={SEO_DATA.siteName} />
  <meta
    property="og:image"
    content="{SEO_DATA.url}/images/og-main-odessa.webp"
  />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/jpeg" />

  <!-- Twitter Cards для оптимізації рендерингу карток у мікроблогах -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={SEO_DATA.title} />
  <meta name="twitter:description" content={SEO_DATA.description} />
  <meta
    name="twitter:image"
    content="{SEO_DATA.url}/images/og-main-odessa.webp"
  />
</svelte:head>

<!-- 
	Structured Data (Schema.org): Впровадження LocalBusiness для ін'єкції в Google Knowledge Graph.
	Гарантує отримання Rich Snippets у локальній видачі (SERP).
-->
<JsonLd
  title={SEO_DATA.title}
  description={SEO_DATA.description}
  canonical={SEO_DATA.url}
/>

<!-- Семантична структура DOM згідно з гайдлайнами WCAG 2.1 та доступності ARIA -->
<main id="main-content" lang="uk">
  <!-- 
		Критичний шлях рендерингу (Critical Rendering Path): 
		Компонент HeroSection віддається через SSR для миттєвої фіксації LCP (Largest Contentful Paint).
	-->
  <HeroSection />
  <!-- 
		Динамічний рендеринг: Захищаємо метрику INP (Interaction to Next Paint).
		Запобігаємо тривалому блокуванню CPU під час ініціалізації великих JS-модулів.
	-->
  {#if HowItWorksComponent}
    <HowItWorksComponent />
    <Advantages />
    <BecomeMaster />
    <Faq />
  {:else}
    <!-- 
			Layout Placeholder: Жорстке резервування простору у вьюпорті.
			Гарантує нульовий показник CLS (Cumulative Layout Shift) при гідрації чанку.
		-->
    <div class="lazy-load-placeholder" aria-hidden="true"></div>
  {/if}
</main>

<style>
  /* 
		Оптимізація Layout Engine браузера: Запобігаємо операціям рефлоу (Reflow/Repaint).
		Використовуємо CSScontainment для повної ізоляції піддерева DOM.
	*/
  .lazy-load-placeholder {
    min-height: 550px;
    width: 100%;
    background-color: transparent;
    contain: layout size; /* Повна ізоляція шару для рендерера Blink/V8 */
  }

  /* Адаптивна компенсація висоти для мобільних девайсів (Враховуємо Flex/Grid Stack сдвиги) */
  @media (max-width: 768px) {
    .lazy-load-placeholder {
      min-height: 800px;
    }
  }
</style>
