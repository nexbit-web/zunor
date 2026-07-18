<!-- src/lib/components/footer/index.svelte -->
<script lang="ts">
  import { MapPin } from 'lucide-svelte'
  import BrandIcon from '$lib/components/icons/brand-icon.svelte'
  import type { BrandName } from '$lib/components/icons/brand-icons'

  // ─── Контракт ссылки (data-driven: добавить пункт = добавить строку) ───
  interface FooterLink {
    label: string
    href: string
    /** Внешняя ссылка → откроется в новой вкладке с rel-защитой */
    external?: boolean
  }
  interface FooterColumn {
    /** Используется и как aria-метка <nav>, и как видимый заголовок */
    title: string
    links: FooterLink[]
  }

  const columns: FooterColumn[] = [
    {
      title: 'Послуги',
      links: [
        { label: 'Усі категорії', href: '/services' },
        { label: 'Як це працює', href: '/how-it-works' },
        { label: 'Розмістити завдання', href: '/jobs/new' },
      ],
    },
    {
      title: 'Майстрам',
      links: [
        { label: 'Стати майстром', href: '/user/register' },
        { label: 'Як отримувати замовлення', href: '/how-it-works' },
        { label: 'Zunor для бізнесу', href: '/business' },
      ],
    },
    {
      title: 'Компанія',
      links: [
        { label: 'Про нас', href: '/about' },
        { label: 'Бізнес', href: '/business' },
        // TODO: подставить реальный ящик поддержки перед запуском
        { label: 'Контакти', href: 'mailto:hello@zunor.com', external: true },
      ],
    },
  ]

  // TODO: подставить реальные URL перед запуском
  const socials: { label: string; href: string; icon: BrandName }[] = [
    {
      label: 'Instagram',
      href: 'https://www.instagram.com/zunor_official/',
      icon: 'instagram',
    },
    {
      label: 'Telegram',
      href: 'https://t.me/zunor_official',
      icon: 'telegram',
    },
    { label: 'X', href: 'https://x.com/zunor_official', icon: 'x' },
    {
      label: 'Threads',
      href: 'https://www.threads.com/@zunor_official',
      icon: 'threads',
    },
    {
      label: 'YouTube',
      href: 'https://www.youtube.com/@zunor_ukraine',
      icon: 'youtube',
    },
  ]

  // Юридические страницы обязательны к запуску (см. заметку под кодом)
  const legalLinks: FooterLink[] = [
    { label: 'Політика конфіденційності', href: '/privacy' },
    { label: 'Умови використання', href: '/terms' },
  ]

  // Год вычисляется при рендере; реактивность не нужна — это не $state.
  const year = new Date().getFullYear()
</script>

{#snippet footerLink(link: FooterLink)}
  <a
    href={link.href}
    target={link.external ? '_blank' : undefined}
    rel={link.external ? 'noopener noreferrer' : undefined}
    class="w-fit rounded-sm text-[13px] text-primary transition-colors hover:text-primary-hover hover:underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
  >
    {link.label}
  </a>
{/snippet}

<footer class="border-t border-white/5 bg-black text-white">
  <div class="mx-auto w-full max-w-6xl px-6 pt-14 pb-24 md:pb-12">
    <div class="flex flex-col gap-12 md:flex-row md:justify-between">
      <!-- Бренд -->
      <div class="flex max-w-xs flex-col gap-4">
        <a
          href="/"
          class="w-fit rounded-sm text-xl font-bold leading-none tracking-tighter select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
          aria-label="Zunor — головна"
        >
          Zunor
        </a>
        <p class="text-[13px] leading-relaxed text-white/55">
          Маркетплейс послуг: знаходьте перевірених майстрів або беріть
          замовлення поруч.
        </p>
        <p class="flex items-center gap-1.5 text-[13px] text-white/45">
          <MapPin class="size-3.5" aria-hidden="true" />
          Одеса, Україна
        </p>

        {#if socials.length > 0}
          <ul class="mt-1 flex items-center gap-2">
            {#each socials as social (social.label)}
              <li>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  class="flex size-9 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/18 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
                >
                  <BrandIcon name={social.icon} class="size-4.5" />
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <!-- Колонки навигации -->
      <div class="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-14">
        {#each columns as column, i (column.title)}
          <nav class="flex flex-col gap-3" aria-labelledby={`footer-col-${i}`}>
            <span
              id={`footer-col-${i}`}
              class="text-[13px] font-semibold text-white"
            >
              {column.title}
            </span>
            <div class="flex flex-col gap-2.5">
              {#each column.links as link (link.href + link.label)}
                {@render footerLink(link)}
              {/each}
            </div>
          </nav>
        {/each}
      </div>
    </div>

    <!-- Нижняя полоса -->
    <div
      class="mt-12 flex flex-col gap-4 border-t border-white/5 pt-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <p class="text-[12px] text-white/40">
        © {year} Zunor. Усі права захищені.
      </p>
      <nav
        class="flex flex-wrap items-center gap-x-5 gap-y-2"
        aria-label="Правова інформація"
      >
        {#each legalLinks as link (link.href)}
          <a
            href={link.href}
            class="w-fit rounded-sm text-[13px] text-primary transition-all hover:text-primary-hover hover:underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
          >
            {link.label}
          </a>
        {/each}
      </nav>
    </div>
  </div>
</footer>
