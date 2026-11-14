<script lang="ts">
  // Налаштування — повноцінна сторінка в подачі ClickUp (власник дав
  // скриншот): ліворуч меню розділів на всю висоту з лінією праворуч,
  // «Вийти» притиснуте донизу; активний пункт — сіра плашка без смужок і
  // без жирного. Праворуч — розділи картками з тонкою рамкою (stacked у
  // SettingsGroup). Шапки з аватаром та імʼям немає: вони й так у формі
  // профілю, а над кожним розділом лише відсували його вниз.
  //
  // Модалкою це вже було, і вона не годилась: вміст розділів (форма
  // профілю, анкета асистента) просив ширини, якої модалці бракувало, а
  // кожен розділ — справжній маршрут зі своїм завантажувачем, і окремий
  // механізм підвантаження поверх них лише дублював роутер.

  import { page } from '$app/state'
  import {
    sectionsForRole,
    setSettingsLayout,
    SETTINGS_GROUPS,
  } from '$lib/components/settings'
  import { Spinner } from '$lib/components/ui/spinner'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import { WaveIcon } from '$lib/components/icons'
  import LogOut from '$lib/components/icons/set/log-out.svelte'
  import toast from 'svelte-hot-french-toast'
  import { signOutAndGo } from '$lib/utils/sign-out'

  let { children } = $props()

  // Розділи тут — картки ClickUp. Кроки онбордингу мають свою подачу
  // (split), її задає вже не цей лейаут.
  setSettingsLayout('stacked')

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

  // Вихід — через підтвердження: пункт стоїть останнім у меню, і
  // випадковий клік повз сусідній пункт викидав би з акаунта одразу.
  let confirmSignOut = $state(false)

  // Вихід — дія, а не розділ: окремої сторінки з однією кнопкою для
  // нього немає, він стоїть останнім пунктом меню.
  async function handleSignOut(): Promise<void> {
    if (signingOut) return
    signingOut = true

    try {
      await signOutAndGo('/')
      toast('До зустрічі!', { icon: WaveIcon })
    } catch {
      signingOut = false
      confirmSignOut = false
      toast.error('Не вдалося вийти. Спробуйте ще раз.')
    }
    // При успіху не скидаємо: сторінка вже пішла на головну, а діалог
    // до того показує «Виходимо...».
  }

  // Пункт меню, як у ClickUp: 36px, іконка 18 кольору тексту, текст
  // звичайної ваги. Невибраний — сірий, активний — сіра плашка й
  // яскравий текст. Кольори — палітра ClickUp (.settings-scope у
  // layout.css).
  const ITEM =
    'flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[15px] transition-colors'
  const IDLE = 'text-(--settings-nav-ink) hover:bg-(--settings-hover)'
  const ACTIVE = 'bg-(--settings-active) text-foreground'
</script>

<svelte:head><title>{sectionLabel} · Налаштування · Zunor</title></svelte:head>

{#snippet signOutIcon()}
  {#if signingOut}
    <Spinner class="size-4.5 shrink-0 animate-spin" aria-hidden="true" />
  {:else}
    <LogOut size={18} strokeWidth={1.75} class="shrink-0" aria-hidden="true" />
  {/if}
{/snippet}

<!-- settings-scope — палітра ClickUp для всієї сторінки: тло, панель
     меню, картки, лінії, текст (layout.css). -->
<div class="settings-scope flex min-h-svh">
  <!-- ─── Меню розділів (компʼютер) ───
       Як у ClickUp: колонка на всю висоту вікна з лінією праворуч, сама
       стоїть, коли сторінка гортається (sticky). Зверху «Усі
       налаштування», далі групи з сірими підзаголовками — без ліній між
       ними, лише повітря. «Вийти» — окремо внизу, під лінією: це дія, а
       не розділ. -->
  <nav
    class="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-(--settings-panel-edge) bg-(--settings-panel) md:flex"
    aria-label="Розділи налаштувань"
  >
    <div class="min-h-0 flex-1 overflow-y-auto px-3 pt-6 pb-4">
      <p class="px-2.5 pb-4 text-[19px] font-semibold tracking-[-0.01em]">
        Усі налаштування
      </p>

      {#each groups as group, i (group.id)}
        <p
          id="settings-group-{group.id}"
          class="px-2.5 pb-1.5 text-[13.5px] font-medium text-(--settings-nav-label) {i >
          0
            ? 'pt-6'
            : ''}"
        >
          {group.label}
        </p>

        <ul
          class="flex flex-col gap-0.5"
          aria-labelledby="settings-group-{group.id}"
        >
          {#each group.sections as section (section.slug)}
            {@const isActive = activeSlug === section.slug}
            <li>
              <a
                href="/dashboard/settings/{section.slug}"
                aria-current={isActive ? 'page' : undefined}
                class="{ITEM} {isActive ? ACTIVE : IDLE}"
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
    </div>

    <div class="border-t border-(--settings-panel-edge) px-3 py-2.5">
      <button
        type="button"
        onclick={() => (confirmSignOut = true)}
        disabled={signingOut}
        class="{ITEM} {IDLE} cursor-pointer disabled:cursor-default disabled:opacity-60"
      >
        {@render signOutIcon()}
        Вийти
      </button>
    </div>
  </nav>

  <div class="min-w-0 flex-1 px-4 pt-3 pb-20 sm:px-6 md:px-10 md:pt-12 lg:px-14">
    <div class="mx-auto w-full max-w-220">
      <!-- ─── Меню розділів (телефон) ───
           Смуга розділів, що гортається вбік: окремий екран зі списком був
           би зайвим кроком перед кожним розділом. Ліворуч — місце під
           кнопку панелі (mobile-trigger): вона плаває в тому самому куті. -->
      <div
        class="-mx-4 mb-6 flex items-center gap-1 border-b border-(--settings-panel-edge) px-4 pb-3 sm:-mx-6 sm:px-6 md:hidden"
      >
        <span class="size-10 shrink-0" aria-hidden="true"></span>

        <nav
          class="flex min-w-0 flex-1 gap-1 overflow-x-auto"
          aria-label="Розділи налаштувань"
        >
          {#each sections as section (section.slug)}
            {@const isActive = activeSlug === section.slug}
            <a
              href="/dashboard/settings/{section.slug}"
              aria-current={isActive ? 'page' : undefined}
              class="flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[15px] whitespace-nowrap transition-colors {isActive
                ? ACTIVE
                : IDLE}"
            >
              <section.icon
                size={18}
                strokeWidth={1.75}
                class="shrink-0"
                aria-hidden="true"
              />
              {section.label}
            </a>
          {/each}

          <button
            type="button"
            onclick={() => (confirmSignOut = true)}
            disabled={signingOut}
            class="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 text-[15px] whitespace-nowrap transition-colors {IDLE} disabled:opacity-60"
          >
            {@render signOutIcon()}
            Вийти
          </button>
        </nav>
      </div>

      <!-- Без лінії під заголовком: розділи нижче й так у картках із
           рамкою, і друга лінія над першою карткою лише двоїлась. -->
      <h1 class="mb-8 text-[24px] font-semibold tracking-[-0.015em]">
        {sectionLabel}
      </h1>

      {@render children()}
    </div>
  </div>
</div>

<!-- Діалог той самий, що й «Видалити фото профілю?». Пункт меню
     звичайного кольору, як «Log out» у ClickUp, а червона — дія тут, у
     підтвердженні; «Скасувати» лишається на місці. Під час виходу обидві
     кнопки неактивні, а напис каже, що відбувається. -->
<AlertDialog.Root bind:open={confirmSignOut}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Вийти з акаунта?</AlertDialog.Title>
      <AlertDialog.Description>
        Щоб повернутись, доведеться увійти знову.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={signingOut}>Скасувати</AlertDialog.Cancel>
      <AlertDialog.Action
        onclick={handleSignOut}
        disabled={signingOut}
        aria-busy={signingOut}
        variant="destructive"
      >
        {signingOut ? 'Виходимо...' : 'Вийти'}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
