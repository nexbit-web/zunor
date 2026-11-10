<script lang="ts">
  // Лендинг для клієнтів. Збирається заново, блок за блоком, у подачі
  // ClickUp: шапка (components/header) і перший екран уже є, решта
  // секцій додаватиметься сюди по одній.
  //
  // Усе рендериться на сервері, без лінивих чанків: пошуковик мусить
  // бачити весь текст сторінки.
  import JsonLd from '$lib/components/seo/JsonLd.svelte'
  import Hero from '$lib/components/landing/hero.svelte'
  import ProductPreview from '$lib/components/landing/product-preview.svelte'

  const SEO = {
    title: 'Клінінг Одеса — прибирання без пошуку майстра | Zunor',
    description:
      'Опиши, що прибрати, — майстри поруч самі запропонують ціну. Звичайне, генеральне, після ремонту, миття вікон, хімчистка й регулярне прибирання в Одесі. Безкоштовно для клієнтів.',
    keywords:
      'клінінг одеса, прибирання квартир одеса, замовити клінінг, генеральне прибирання одеса, прибирання після ремонту, миття вікон одеса, хімчистка дивана',
    url: 'https://zunor.org',
    image: 'https://zunor.org/images/og-main-odessa.webp',
  }
</script>

<svelte:head>
  <title>{SEO.title}</title>
  <meta
    name="robots"
    content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
  />
  <meta name="description" content={SEO.description} />
  <meta name="keywords" content={SEO.keywords} />
  <link rel="canonical" href={SEO.url} />

  <meta property="og:locale" content="uk_UA" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={SEO.title} />
  <meta property="og:description" content={SEO.description} />
  <meta property="og:url" content={SEO.url} />
  <meta property="og:site_name" content="Zunor" />
  <meta property="og:image" content={SEO.image} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={SEO.title} />
  <meta name="twitter:description" content={SEO.description} />
  <meta name="twitter:image" content={SEO.image} />
</svelte:head>

<JsonLd title={SEO.title} description={SEO.description} canonical={SEO.url} />

<main id="main-content" lang="uk">
  <Hero />
  <ProductPreview />
</main>
