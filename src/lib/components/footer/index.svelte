<!--
  Підвал публічних сторінок — темний у будь-якій темі, як у ClickUp:
  бренд і соцмережі ліворуч, колонки посилань праворуч, правові
  сторінки внизу.

  Посилання — лише на те, що існує. Колишній підвал вів на /services,
  /how-it-works, /jobs/new і /business — жодної з цих сторінок немає, і
  кожне посилання давало 404.
-->
<script lang="ts">
  import MapPin from '$lib/components/icons/set/map-pin.svelte'
  import BrandIcon from '$lib/components/icons/brand-icon.svelte'
  import type { BrandName } from '$lib/components/icons/brand-icons'
  import Logo from '$lib/components/header/logo.svelte'
  import { ORDER_HREF } from '$lib/components/landing/content'

  interface FooterLink {
    label: string
    href: string
    /** Зовнішнє — нова вкладка з rel-захистом. */
    external?: boolean
  }

  const columns: { title: string; links: FooterLink[] }[] = [
    {
      title: 'Клієнтам',
      links: [
        { label: 'Замовити прибирання', href: ORDER_HREF },
        { label: 'Як це працює', href: '/#how' },
        { label: 'Послуги', href: '/#services' },
        { label: 'Часті питання', href: '/#faq' },
      ],
    },
    {
      title: 'Майстрам',
      links: [
        { label: 'Стати майстром', href: '/master/about' },
        { label: 'Увійти', href: '/user/login' },
      ],
    },
    {
      title: 'Компанія',
      links: [
        { label: 'Про нас', href: '/about' },
        // TODO: підставити справжню скриньку підтримки перед запуском
        { label: 'Написати нам', href: 'mailto:hello@zunor.com', external: true },
      ],
    },
  ]

  // TODO: підставити справжні адреси перед запуском
  const socials: { label: string; href: string; icon: BrandName }[] = [
    { label: 'Instagram', href: 'https://www.instagram.com/zunor_official/', icon: 'instagram' },
    { label: 'Telegram', href: 'https://t.me/zunor_official', icon: 'telegram' },
    { label: 'Threads', href: 'https://www.threads.com/@zunor_official', icon: 'threads' },
    { label: 'YouTube', href: 'https://www.youtube.com/@zunor_ukraine', icon: 'youtube' },
  ]

  const legal: FooterLink[] = [
    { label: 'Політика конфіденційності', href: '/privacy' },
    { label: 'Умови використання', href: '/terms' },
  ]

  const year = new Date().getFullYear()
</script>

<footer class="dark bg-[#1d1d1c] text-[#fafaf9]">
  <div class="mx-auto w-full max-w-7xl px-4 pt-16 pb-10 sm:px-6 sm:pt-20">
    <div class="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
      <div class="flex max-w-sm flex-col gap-5">
        <Logo />
        <p class="text-[14px] leading-relaxed text-white/60">
          Сервіс прибирання нового покоління. Ти описуєш задачу — майстри
          поруч приходять самі.
        </p>
        <p class="flex items-center gap-1.5 text-[13px] text-white/50">
          <MapPin class="size-3.5" aria-hidden="true" />
          Одеса, Україна
        </p>
        <ul class="flex items-center gap-2">
          {#each socials as social (social.label)}
            <li>
              <a
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.label}
                class="flex size-10 items-center justify-center rounded-full bg-white/6 text-white/80 transition-colors hover:bg-white/12 hover:text-white"
              >
                <BrandIcon name={social.icon} class="size-4.5" />
              </a>
            </li>
          {/each}
        </ul>
      </div>

      <div class="grid grid-cols-2 gap-10 sm:grid-cols-3">
        {#each columns as column, i (column.title)}
          <nav class="flex flex-col gap-4" aria-labelledby="footer-col-{i}">
            <span id="footer-col-{i}" class="text-[13px] font-semibold text-white">
              {column.title}
            </span>
            <ul class="flex flex-col gap-3">
              {#each column.links as link (link.href)}
                <li>
                  <a
                    href={link.href}
                    target={link.external ? '_blank' : undefined}
                    rel={link.external ? 'noopener noreferrer' : undefined}
                    class="text-[14px] text-white/60 transition-colors hover:text-white"
                  >
                    {link.label}
                  </a>
                </li>
              {/each}
            </ul>
          </nav>
        {/each}
      </div>
    </div>

    <div
      class="mt-16 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <p class="text-[12.5px] text-white/45">© {year} Zunor</p>
      <nav class="flex flex-wrap gap-x-6 gap-y-2" aria-label="Правова інформація">
        {#each legal as link (link.href)}
          <a
            href={link.href}
            class="text-[12.5px] text-white/45 transition-colors hover:text-white"
          >
            {link.label}
          </a>
        {/each}
      </nav>
    </div>
  </div>
</footer>
