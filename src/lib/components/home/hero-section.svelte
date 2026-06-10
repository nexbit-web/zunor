<script lang="ts">
  import { onMount } from 'svelte'
  import { ArrowRight, MapPin } from 'lucide-svelte'
  import { Skeleton } from '$lib/components/ui/skeleton'

  // Определение строгого интерфейса пропсов
  interface HeroProps {
    illustration?: string | null
    alt?: string
  }

  // Деструктуризация пропсов Svelte 5 с жесткой валидацией дефолтных значений
  let {
    illustration = '/home-img.webp',
    alt = 'Прибирання Zunor Одеса',
  }: HeroProps = $props()

  // Инициализация реактивного состояния (Runes)
  let canLoad = $state<boolean>(false)
  let isImageLoaded = $state<boolean>(false)
  let hasError = $state<boolean>(false)

  /**
   * Безопасная валидация URL для предотвращения XSS инъекций через протоколы (например, javascript:)
   */
  const sanitizedSrc = $derived.by(() => {
    if (!illustration) return ''
    // Разрешаем только относительные пути или безопасные веб-протоколы
    if (
      illustration.startsWith('/') ||
      illustration.startsWith('http://') ||
      illustration.startsWith('https://')
    ) {
      return illustration
    }
    return '' // Возвращаем пустую строку при подозрении на инъекцию
  })

  onMount(() => {
    // Проверяем соответствие десктопному экрану при наступлении window.onload
    const handlePageLoad = (): void => {
      if (window.matchMedia('(min-width: 1024px)').matches) {
        canLoad = true
      }
    }

    if (document.readyState === 'complete') {
      if (window.matchMedia('(min-width: 1024px)').matches) {
        canLoad = true
      }
    } else {
      window.addEventListener('load', handlePageLoad, { once: true })
    }

    // Чистка ресурсов
    return () => {
      window.removeEventListener('load', handlePageLoad)
    }
  })
</script>

<section
  class="mx-auto max-w-6xl px-4 py-12 sm:px-8 md:py-16 lg:px-16"
  aria-label="Главный экран"
>
  <div
    class="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_410px] lg:gap-16 xl:grid-cols-[520px_1fr] xl:gap-20"
  >
    <div class="flex flex-col items-start gap-5 text-left">
      <div class="flex items-center gap-1.5" role="presentation">
        <MapPin class="size-4  " aria-hidden="true" />
        <span class="">Одеса, UA</span>
      </div>

      <h1
        class="font-sans text-4xl font-bold encoding-tight text-foreground sm:text-5xl sm:leading-tight lg:text-[52px] lg:leading-16"
      >
        Замовляйте прибирання коли завгодно з Zunor
      </h1>

      <a
        href="/jobs/new"
        class="cta-btn group"
        aria-label="Перейти к оформлению заказа на уборку"
      >
        Замовити послугу
      </a>
    </div>

    <div class="hidden justify-end lg:flex">
      <div
        class="relative aspect-square w-full max-w-102.5 overflow-hidden rounded-[10px] bg-linear-to-br from-[#e8f7f0] via-[#f3f4f6] to-[#eef0f2] shadow-sm"
      >
        {#if sanitizedSrc && !hasError}
          {#if !isImageLoaded}
            <Skeleton class="absolute inset-0 z-10 size-full" />
          {/if}

          {#if canLoad}
            <img
              class="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-700 ease-out"
              class:opacity-100={isImageLoaded}
              src={sanitizedSrc}
              {alt}
              decoding="async"
              loading="lazy"
              onload={() => {
                isImageLoaded = true
              }}
              onerror={() => {
                hasError = true
              }}
            />
          {/if}
        {:else}
          <div
            class="absolute inset-0 size-full bg-linear-to-br from-[#008e60]/10 to-[#eef0f2]"
            role="img"
            aria-label="Zunor Cleaning"
          ></div>
        {/if}
      </div>
    </div>
  </div>
</section>

<style>
  .cta-btn {
    width: 100%;
    max-width: 320px;
    position: relative;
    overflow: hidden;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 18px 32px;
    font-size: 18px;
    font-weight: 500;
    color: var(--background);
    background: var(--foreground);
    border: none;
    border-radius: 14px;
    cursor: pointer;
    text-decoration: none;
    box-shadow: 0 4px 14px rgba(0, 142, 96, 0.2);
    /* Использование комбинированных аппаратных трансформаций */
    will-change: transform, box-shadow;
    transition:
      transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
      box-shadow 0.25s ease;
  }

  @media (min-width: 640px) {
    .cta-btn {
      width: auto;
    }
  }

  .cta-btn:hover {
    transform: translateY(-2px);
    box-shadow:
      0 0 24px 4px rgba(0, 142, 96, 0.4),
      0 0 60px 14px rgba(0, 142, 96, 0.15);
  }

  .cta-btn:active {
    transform: scale(0.98) translateY(-1px);
  }

  /* Оптимизированный эффект мерцания (Shimmer) с использованием композитных слоев */
  .cta-btn::after {
    content: '';
    position: absolute;
    top: 0;
    left: -150%;
    width: 80%;
    height: 100%;
    background: linear-gradient(
      100deg,
      transparent 20%,
      rgba(169, 169, 169, 0.53) 50%,
      transparent 80%
    );
    animation: shimmer 4s infinite linear;
    pointer-events: none;
  }

  @keyframes shimmer {
    0% {
      transform: translateX(0);
    }
    30% {
      transform: translateX(375%);
    }
    100% {
      transform: translateX(375%);
    }
  }

  /* Уважение системных настроек пользователя (Accessibility) */
  @media (prefers-reduced-motion: reduce) {
    .cta-btn,
    .cta-btn::after {
      animation: none !important;
      transition: none !important;
      transform: none !important;
    }
  }
</style>
