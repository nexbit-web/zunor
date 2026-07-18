<script lang="ts">
  import { Skeleton } from '$lib/components/ui/skeleton'

  interface BecomeMasterProps {
    illustration?: string | null
    alt?: string
  }

  let { illustration = '/master-test4.png', alt = 'Майстер Zunor' }: BecomeMasterProps =
    $props()

  let isImageLoaded = $state(false)
  let hasError = $state(false)

  const safeSrc = $derived.by(() => {
    if (!illustration) return ''
    const src = illustration.trim()
    if (/^https?:\/\//i.test(src)) return src
    if (src.startsWith('/') && !/^\/[/\\]/.test(src)) return src
    return ''
  })
</script>

<section
  class="mx-auto max-w-6xl px-4 py-12 sm:px-8 md:py-14 lg:px-10"
  aria-labelledby="become-master-title"
>
  <div
    class="grid grid-cols-1 items-center gap-10 lg:grid-cols-[410px_1fr] lg:gap-16 xl:grid-cols-[1fr_520px] xl:gap-20"
  >
    <!-- LEFT (картинка): на мобайлі — зверху, на десктопі — ліворуч -->
    <div class="flex justify-center lg:justify-start">
      <div
        class="relative aspect-square w-full max-w-102.5 overflow-hidden rounded-[10px] bg-linear-to-br from-[#e8f7f0] via-[#f3f4f6] to-[#eef0f2] shadow-sm"
      >
        {#if safeSrc && !hasError}
          {#if !isImageLoaded}
            <Skeleton class="absolute inset-0 z-10 size-full" />
          {/if}
          <img
            class="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-700 ease-out motion-reduce:transition-none"
            class:opacity-100={isImageLoaded}
            src={safeSrc}
            {alt}
            decoding="async"
            loading="lazy"
            onload={() => (isImageLoaded = true)}
            onerror={() => (hasError = true)}
          />
        {:else}
          <div
            class="absolute inset-0 size-full bg-linear-to-br from-[#008e60]/10 to-[#eef0f2]"
            role="img"
            aria-label={alt}
          ></div>
        {/if}
      </div>
    </div>

    <!-- RIGHT (текст) -->
    <div class="flex flex-col items-start gap-5 text-left">
      <h2
        id="become-master-title"
        class="text-4xl font-bold tracking-tight text-balance text-foreground sm:text-5xl sm:leading-tight lg:text-[52px] lg:leading-[1.08]"
      >
        Заробляйте на прибиранні у зручний для вас час
      </h2>

      <p class="max-w-md font-light leading-relaxed text-pretty sm:text-lg">
        Приймайте замовлення поруч, формуйте власний графік і отримуйте оплату
        напряму. Без посередників між вами та клієнтом.
      </p>

      <div class="flex flex-wrap items-center gap-6">
        <a href="/user/register" class="cta-btn">Початок співпраці</a>
        <a
          href="/master/about"
          class="rounded-sm border-b-[1.5px] border-foreground pb-1 text-base font-semibold tracking-[-0.01em] text-foreground transition-colors hover:border-muted-foreground hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40"
        >
          Дізнатися більше
        </a>
      </div>
    </div>
  </div>
</section>

<style>
  /* Уніфіковано з Hero: одна спокійна тінь на hover, без shimmer і без подвійного neon-glow. */
  .cta-btn {
    width: 100%;
    max-width: 320px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 18px 32px;
    font-size: 18px;
    font-weight: 500;
    color: var(--background);
    background: var(--foreground);
    border-radius: 14px;
    text-decoration: none;
    box-shadow: 0 4px 14px rgba(0, 142, 96, 0.2);
    transition:
      transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
      box-shadow 0.2s ease;
  }

  @media (min-width: 640px) {
    .cta-btn {
      width: auto;
    }
  }

  .cta-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 142, 96, 0.28);
  }

  .cta-btn:active {
    transform: scale(0.98) translateY(-1px);
  }

  /* Кастомна кнопка без нативного outline — фокус обов'язково потрібен явно (клавіатурна навігація) */
  .cta-btn:focus-visible {
    outline: 2px solid var(--foreground);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .cta-btn {
      transition: none !important;
      transform: none !important;
    }
  }
</style>