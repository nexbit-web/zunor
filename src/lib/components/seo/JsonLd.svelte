<script lang="ts">
  // Контракт пропсів (Data Interface Contract)
  interface Props {
    title: string
    description: string
    canonical: string
  }

  // Svelte 5: Деструктуризація реактивних пропсів
  let { title, description, canonical }: Props = $props()

  // Оптимізація під архітектуру Svelte 5: Використовуємо руну $derived()
  // Це створює замикання (closure), фіксує реактивні залежності та усуває помилку state_referenced_locally
  const schemaData = $derived({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'Zunor Cleaning Service',
    alternateName: 'Zunor',
    description: description,  
    url: canonical,  
    logo: `${canonical}/logo.png`,
    image: `${canonical}/og-image.jpg`,
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Одеса',
      addressRegion: 'Одеська область',
      addressCountry: 'UA',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: '46.4825',
      longitude: '30.7233',
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ],
        opens: '08:00',
        closes: '21:00',
      },
    ],
    areaServed: {
      '@type': 'AdministrativeArea',
      name: 'Одеса',
    },
  })

  // Другий рівень реактивності (Derived String serialization)
  // Рядок буде перегенеровано виключно тоді, коли зміниться сам об'єкт schemaData
  const jsonString = $derived(JSON.stringify(schemaData))
</script>

<svelte:head>
  {@html `<script type="application/ld+json">${jsonString}</script>`}
</svelte:head>
