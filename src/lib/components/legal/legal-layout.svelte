<!--
  Каркас юридичних сторінок: якірний зміст (desktop sidebar / mobile details),
  нумерація h2 через CSS counter, scrollspy (IntersectionObserver, з cleanup),
  друк/PDF, кнопка «нагору». Контент передається через children snippet.
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import ArrowLeft from '@lucide/svelte/icons/arrow-left'
  import ChevronUp from '@lucide/svelte/icons/chevron-up'
  import Printer from '@lucide/svelte/icons/printer'

  type Section = { id: string; label: string }

  let {
    title,
    updated,
    sections,
    children,
  }: {
    title: string
    updated: string // ISO-дата
    sections: Section[]
    children: Snippet
  } = $props()

  const updatedLabel = $derived(
    new Date(updated).toLocaleDateString('uk-UA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  )

  let activeId = $state(sections[0]?.id ?? '')
  let showTop = $state(false)

  // Scrollspy — легітимний випадок роботи з DOM API поза реактивністю Svelte.
  // Observer і scroll-listener завжди прибираються при демонтажі/зміні sections.
  $effect(() => {
    const headings = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null)
    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            activeId = entry.target.id
            break
          }
        }
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    )
    headings.forEach((el) => observer.observe(el))

    const onScroll = () => {
      showTop = window.scrollY > 600
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
    }
  })

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
</script>

<div class="legal-scope min-h-svh px-5 py-10 sm:py-14">
  <div
    class="mx-auto flex w-full max-w-[1080px] flex-col gap-8 lg:flex-row lg:items-start lg:gap-12"
  >
    <!-- Mobile: назад + згорнутий зміст -->
    <div class="flex flex-col gap-4 print:hidden lg:hidden">
      <a
        href="/"
        class="inline-flex w-fit items-center gap-1.5 rounded-md text-[13.5px] font-medium text-muted-foreground transition-opacity hover:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeft class="size-4" aria-hidden="true" /> На головну
      </a>
      <details class="rounded-2xl border border-border bg-card">
        <summary
          class="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[13.5px] font-semibold text-foreground"
        >
          Зміст документа
        </summary>
        <nav
          class="flex flex-col gap-0.5 border-t border-border p-2"
          aria-label="Зміст"
        >
          {#each sections as s, i (s.id)}
            <a
              href="#{s.id}"
              class="rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {i + 1}. {s.label}
            </a>
          {/each}
        </nav>
      </details>
    </div>

    <!-- Desktop sidebar -->
    <aside
      class="hidden shrink-0 print:hidden lg:sticky lg:top-10 lg:block lg:w-[240px] lg:self-start"
    >
      <a
        href="/"
        class="mb-6 inline-flex items-center gap-1.5 rounded-md text-[13.5px] font-medium text-muted-foreground transition-opacity hover:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeft class="size-4" aria-hidden="true" /> На головну
      </a>
      <p
        class="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase"
      >
        Зміст
      </p>
      <nav
        class="flex flex-col gap-0.5 border-l border-border pl-3"
        aria-label="Зміст документа"
      >
        {#each sections as s, i (s.id)}
          <a
            href="#{s.id}"
            class={[
              '-ml-px border-l-2 py-1.5 pl-3 text-[13px] leading-snug transition-colors',
              activeId === s.id
                ? 'border-foreground font-semibold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ]}
          >
            {i + 1}. {s.label}
          </a>
        {/each}
      </nav>
    </aside>

    <!-- Контент -->
    <main class="min-w-0 flex-1 print:max-w-none">
      <div
        class="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6"
      >
        <div>
          <h1
            class="text-[28px] font-bold tracking-[-0.03em] text-foreground sm:text-[34px]"
          >
            {title}
          </h1>
          <p class="mt-2 text-[13px] text-muted-foreground">
            Останнє оновлення: {updatedLabel}
          </p>
        </div>
        <button
          type="button"
          onclick={() => window.print()}
          class="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring print:hidden"
        >
          <Printer class="size-3.5" aria-hidden="true" /> Друк / PDF
        </button>
      </div>

      <div class="legal-prose">
        {@render children()}
      </div>
    </main>
  </div>

  {#if showTop}
    <button
      type="button"
      onclick={scrollToTop}
      class="fixed right-5 bottom-5 flex size-11 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0 print:hidden"
      aria-label="Нагору сторінки"
    >
      <ChevronUp class="size-5" aria-hidden="true" />
    </button>
  {/if}
</div>

<style>
  :global(html) {
    scroll-behavior: smooth;
  }
  @media (prefers-reduced-motion: reduce) {
    :global(html) {
      scroll-behavior: auto;
    }
  }
  :global(body:has(.legal-scope)) {
    background: var(--background);
  }

  .legal-prose {
    color: var(--foreground);
    max-width: 68ch;
    counter-reset: legal-section;
  }
  .legal-prose :global(section) {
    scroll-margin-top: 96px;
  }
  .legal-prose :global(h2) {
    counter-increment: legal-section;
    display: flex;
    gap: 0.6rem;
    align-items: baseline;
    font-size: 19px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--foreground);
    margin-top: 2.75rem;
    margin-bottom: 0.9rem;
  }
  .legal-prose :global(h2)::before {
    content: counter(legal-section) '.';
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .legal-prose :global(h3) {
    font-size: 15px;
    font-weight: 600;
    color: var(--foreground);
    margin-top: 1.5rem;
    margin-bottom: 0.5rem;
  }
  .legal-prose :global(p) {
    font-size: 14.5px;
    line-height: 1.75;
    color: color-mix(in oklch, var(--foreground) 88%, var(--muted-foreground));
    margin-bottom: 0.9rem;
  }
  .legal-prose :global(ul),
  .legal-prose :global(ol) {
    margin: 0.75rem 0 1.1rem;
    padding-left: 1.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .legal-prose :global(li) {
    font-size: 14.5px;
    line-height: 1.7;
    color: color-mix(in oklch, var(--foreground) 88%, var(--muted-foreground));
  }
  .legal-prose :global(ul) {
    list-style: disc;
  }
  .legal-prose :global(ol) {
    list-style: decimal;
  }
  .legal-prose :global(strong) {
    color: var(--foreground);
    font-weight: 600;
  }
  .legal-prose :global(a) {
    color: var(--foreground);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .legal-prose :global(.legal-callout) {
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--muted);
    padding: 16px 18px;
    font-size: 13.5px;
    line-height: 1.65;
    color: var(--foreground);
    margin: 1.25rem 0;
  }
  .legal-prose :global(.legal-callout.warn) {
    border-color: color-mix(in oklch, var(--destructive) 25%, transparent);
    background: color-mix(in oklch, var(--destructive) 6%, transparent);
  }

  @media print {
    :global(.legal-scope) {
      background: white !important;
    }
  }
</style>
