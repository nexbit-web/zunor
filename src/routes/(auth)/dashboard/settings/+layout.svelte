<script lang="ts">
  // Налаштування — повноцінна сторінка в подачі ClickUp: ліворуч власне
  // меню розділів під підзаголовками груп і «Вийти» внизу, праворуч
  // великий заголовок розділу, а під ним розділи на дві колонки (назва з
  // поясненням ліворуч, поля праворуч).
  //
  // Модалкою це вже було, і вона не годилась: вміст розділів (форма
  // профілю, анкета асистента) просив ширини, якої модалці бракувало, а
  // кожен розділ — справжній маршрут зі своїм завантажувачем, і окремий
  // механізм підвантаження поверх них лише дублював роутер.

  import { goto, invalidateAll } from '$app/navigation'
  import { page } from '$app/state'
  import {
    sectionsForRole,
    setSettingsLayout,
    SETTINGS_GROUPS,
  } from '$lib/components/settings'
  import { Spinner } from '$lib/components/ui/spinner'
  import { signOut } from '$lib/auth-client'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import { disconnectPusher } from '$lib/pusher-client'
  import { WaveIcon } from '$lib/components/icons'
  import { LogOut } from 'lucide-svelte'
  import toast from 'svelte-hot-french-toast'

  let { children } = $props()

  // Розділи тут — у дві колонки. Та сама форма профілю в онбордингу
  // лишається карткою: там подачу задає вже не цей лейаут.
  setSettingsLayout('split')

  const role = $derived(page.data.role ?? null)
  const sections = $derived(sectionsForRole(role))

  // Групи без жодного доступного пункту не показуємо: порожній
  // підзаголовок читається як недовантажене меню.
  const groups = $derived(
    SETTINGS_GROUPS.map((g) => ({
      ...g,
      sections: sections.filter((s) => s.group === g.id),
    })).filter((g) => g.sections.length > 0),
  )

  const activeSlug = $derived(
    page.url.pathname.slice('/dashboard/settings/'.length).split('/')[0],
  )

  const sectionLabel = $derived(
    sections.find((s) => s.slug === activeSlug)?.label ?? 'Налаштування',
  )

  let signingOut = $state(false)

  // Вихід — дія, а не розділ: окремої сторінки з однією кнопкою для
  // нього немає, він стоїть унизу меню, як у ClickUp.
  async function handleSignOut(): Promise<void> {
    if (signingOut) return
    signingOut = true

    try {
      // Спершу рвемо реалтайм: інакше лишиться відкритий сокет
      // на канал користувача, якого вже немає в сесії.
      chatStore.unsubscribeAll()
      disconnectPusher()

      await signOut()
      await invalidateAll()
      await goto('/')
      toast('До зустрічі!', { icon: WaveIcon })
    } catch {
      signingOut = false
      toast.error('Не вдалося вийти. Спробуйте ще раз.')
    }
    // При успіху не скидаємо: сторінка вже пішла на головну.
  }
</script>

<svelte:head><title>{sectionLabel} · Налаштування · Zunor</title></svelte:head>

<div class="flex min-h-(--app-h) md:min-h-0">
  <!-- ─── Меню розділів (десктоп) ───
       Липке й на всю висоту блока: вміст розділу прокручується, а меню
       лишається на місці зі своєю прокруткою, як у ClickUp. Висота —
       блок контенту мінус його рамка 1px зверху й знизу, інакше блок
       завжди мав би 2px зайвої прокрутки.
       Тон меню відрізняється від вмісту: у світлій темі — ледь сіре, у
       темній — на крок світліше за тло розділу.
       Активний пункт — нейтральна сіра плашка, без акцентного кольору:
       меню не повинно перефарбовуватись разом із палітрою, як у ClickUp. -->
  <aside
    class="sticky top-0 hidden h-[calc(var(--app-h)-2px)] w-60 shrink-0 flex-col border-r border-border bg-muted/40 md:flex dark:bg-card"
  >
    <p class="px-5 pt-6 pb-1 text-[17px] font-semibold tracking-[-0.01em]">
      Налаштування
    </p>

    <nav
      class="min-h-0 flex-1 overflow-y-auto px-3 pb-3"
      aria-label="Розділи налаштувань"
    >
      {#each groups as group (group.id)}
        <p class="px-2 pt-4 pb-1.5 text-[13px] text-muted-foreground">
          {group.label}
        </p>
        <ul class="flex flex-col gap-0.5">
          {#each group.sections as section (section.slug)}
            {@const isActive = activeSlug === section.slug}
            <li>
              <a
                href="/dashboard/settings/{section.slug}"
                aria-current={isActive ? 'page' : undefined}
                class="flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2 text-[14.5px] transition-colors {isActive
                  ? 'bg-accent text-foreground'
                  : 'text-foreground/85 hover:bg-accent/60 hover:text-foreground'}"
              >
                <section.icon
                  size={18}
                  strokeWidth={1.75}
                  class="shrink-0"
                  aria-hidden="true"
                />
                {section.label}
              </a>
            </li>
          {/each}
        </ul>
      {/each}
    </nav>

    <div class="border-t border-border p-3">
      <button
        type="button"
        onclick={handleSignOut}
        disabled={signingOut}
        aria-busy={signingOut}
        class="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-[8px] px-2 text-start text-[14.5px] text-foreground/85 transition-colors hover:bg-accent/60 hover:text-foreground disabled:cursor-default disabled:opacity-60"
      >
        {#if signingOut}
          <Spinner class="size-4.5 animate-spin" aria-hidden="true" />
        {:else}
          <LogOut
            size={18}
            strokeWidth={1.75}
            class="shrink-0"
            aria-hidden="true"
          />
        {/if}
        Вийти
      </button>
    </div>
  </aside>

  <!-- @container: розділи діляться на дві колонки за шириною ЦІЄЇ
       області, а не вікна — на планшеті поруч із меню її мало, і колонки
       за брейкпоінтом вікна стискали б поля до половини. -->
  <div class="@container min-w-0 flex-1">
    <!-- ─── Меню розділів (телефон) ───
         Горизонтальна смуга під заголовком замість окремого екрана зі
         списком. ps-16 — місце під плаваючу кнопку панелі в кутку. -->
    <nav
      class="flex gap-1 overflow-x-auto border-b border-border py-3 ps-16 pe-3 md:hidden"
      aria-label="Розділи налаштувань"
    >
      {#each sections as section (section.slug)}
        {@const isActive = activeSlug === section.slug}
        <a
          href="/dashboard/settings/{section.slug}"
          aria-current={isActive ? 'page' : undefined}
          class="flex h-10 shrink-0 items-center gap-1.5 rounded-[8px] px-3 text-[14px] whitespace-nowrap transition-colors {isActive
            ? 'bg-accent text-foreground'
            : 'text-foreground/85 hover:bg-accent/60'}"
        >
          <section.icon size={16} strokeWidth={1.75} aria-hidden="true" />
          {section.label}
        </a>
      {/each}

      <button
        type="button"
        onclick={handleSignOut}
        disabled={signingOut}
        aria-busy={signingOut}
        class="flex h-10 shrink-0 items-center gap-1.5 rounded-[8px] px-3 text-[14px] whitespace-nowrap text-foreground/85 transition-colors hover:bg-accent disabled:opacity-60"
      >
        <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
        Вийти
      </button>
    </nav>

    <div class="max-w-[1100px] px-5 pt-7 pb-16 sm:px-10 sm:pt-10 lg:px-14">
      <h1 class="mb-9 text-[28px] leading-tight font-semibold tracking-[-0.02em]">
        {sectionLabel}
      </h1>

      {@render children()}
    </div>
  </div>
</div>
