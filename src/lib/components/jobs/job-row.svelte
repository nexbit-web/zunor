<!--
  Рядок заявки — і в «Моїх заявках» клієнта, і в стрічці майстра.

  Список, а не картки: картка з рамкою на кожну заявку перетворювала
  сторінку на стос однакових коробок, де око шукало різницю в рамках, а
  не в змісті. Тут межа — волосина між рядками, як у сповіщеннях, і вся
  увага — на трьох речах: що (іконка послуги й назва), коли (день
  прибирання) і в якому стані (праворуч).

  Стан на телефоні переїжджає з правої колонки на початок нижнього рядка:
  праворуч від довгої назви йому не лишалось місця, і назва ламалась
  через слово.

  Назва й опис — повністю, без обрізання: опис складає асистент на 2–4
  речення, і саме в ньому те, що відрізняє одну «генеральну двокімнатну»
  від іншої (тварини, духовка, площа). Обрізаний до рядка, він ховав
  головне за трьома крапками.
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import ServiceIcon from '$lib/categories/cleaning/service-icon.svelte'
  import { serviceLabel } from '$lib/categories/cleaning/presets'

  let {
    href,
    service,
    title,
    dimmed = false,
    status,
    meta,
    description = '',
  }: {
    href: string
    /** Ключ послуги з metadata.service — від нього іконка. */
    service: unknown
    title: string
    /** Скасовані й прострочені — пригашені: це вже історія. */
    dimmed?: boolean
    /** Стан: праворуч на широкому екрані, першим у рядку — на телефоні. */
    status: Snippet
    meta: Snippet
    description?: string
  } = $props()

  const label = $derived(
    typeof service === 'string' ? serviceLabel(service) : 'Прибирання',
  )
</script>

<li class="border-b border-border/60">
  <a
    {href}
    class="group -mx-3 flex items-center gap-3.5 rounded-xl px-3 py-3.5 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:gap-4 sm:py-4"
  >
    <span
      class={[
        'flex size-11 shrink-0 items-center justify-center self-start rounded-xl bg-muted text-foreground/80 transition-colors group-hover:bg-background',
        dimmed && 'opacity-60',
      ]}
    >
      <ServiceIcon {service} class="size-7" />
      <span class="sr-only">{label}</span>
    </span>

    <span class={['min-w-0 flex-1', dimmed && 'opacity-60']}>
      <span
        class="block text-[15px] leading-snug font-medium text-pretty text-foreground"
      >
        {title}
      </span>

      <span
        class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted-foreground"
      >
        <span class="contents sm:hidden">{@render status()}</span>
        {@render meta()}
      </span>

      {#if description}
        <!-- pre-line: абзаци з опису лишаються абзацами. -->
        <span
          class="mt-2 block text-[14px] leading-relaxed whitespace-pre-line text-pretty text-muted-foreground"
        >
          {description}
        </span>
      {/if}
    </span>

    <span class="hidden shrink-0 self-start sm:flex">
      {@render status()}
    </span>
  </a>
</li>
