<script lang="ts">
  // Налаштування — повноцінна сторінка в подачі GitHub: ліворуч меню
  // розділів (активний пункт — сіра плашка з синьою смужкою збоку),
  // праворуч одна колонка — заголовок розділу з лінією, поля одне під
  // одним. Шапки з аватаром та імʼям немає: вони й так у формі профілю,
  // а над кожним розділом лише відсували його вниз.
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

  // Розділи тут — одна колонка, як у GitHub. Кроки онбордингу мають
  // свою подачу (split), її задає вже не цей лейаут.
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

  // Пункт меню, як в ActionList GitHub: 32px, іконка приглушена, текст
  // звичайний. Активний — сіра плашка й жирний текст, а синя смужка
  // збоку малюється окремо (див. розмітку). Колір тексту — у самих
  // пунктах: «Вийти» червоний.
  const ITEM =
    'relative flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors'
</script>

<svelte:head><title>{sectionLabel} · Налаштування · Zunor</title></svelte:head>

{#snippet signOutIcon()}
  {#if signingOut}
    <Spinner class="size-4 animate-spin" aria-hidden="true" />
  {:else}
    <LogOut size={16} strokeWidth={1.75} class="shrink-0" aria-hidden="true" />
  {/if}
{/snippet}

<div class="mx-auto w-full max-w-300 px-4 pt-3 pb-16 sm:px-6 md:pt-8 lg:px-10">
  <!-- ─── Меню розділів (телефон) ───
       Смуга розділів, що гортається вбік: окремий екран зі списком був
       би зайвим кроком перед кожним розділом. Ліворуч — місце під
       кнопку панелі (mobile-trigger): вона плаває в тому самому куті. -->
  <div
    class="-mx-4 mb-6 flex items-center gap-1 border-b border-panel-border px-4 pb-3 sm:-mx-6 sm:px-6 md:hidden"
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
          class="flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-sm whitespace-nowrap transition-colors {isActive
            ? 'bg-accent font-semibold'
            : 'hover:bg-accent/70'}"
        >
          <section.icon
            size={16}
            strokeWidth={1.75}
            class="text-muted-foreground"
            aria-hidden="true"
          />
          {section.label}
        </a>
      {/each}

      <button
        type="button"
        onclick={() => (confirmSignOut = true)}
        disabled={signingOut}
        class="flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm whitespace-nowrap text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
      >
        {@render signOutIcon()}
        Вийти
      </button>
    </nav>
  </div>

  <div class="flex gap-6 lg:gap-10">
    <!-- ─── Меню розділів (компʼютер) ───
         Як у GitHub: перша група без підзаголовка, наступні — після лінії
         й зі своїм підзаголовком. Активний пункт — нейтральна сіра
         плашка й синя смужка ліворуч (колір акценту): з неї видно, де
         ти, навіть боковим зором. -->
    <nav class="hidden w-60 shrink-0 md:block" aria-label="Розділи налаштувань">
      <!-- Висота рядка — як у заголовка розділу праворуч (text-2xl),
           тож «Налаштування» стоїть на одній лінії з ним. -->
      <div class="mb-4 flex h-8 items-center px-2">
        <p class="text-[15px] font-semibold">Налаштування</p>
      </div>

      {#each groups as group, i (group.id)}
        {#if i > 0}
          <div class="my-2 border-t border-panel-border"></div>
          <p
            id="settings-group-{group.id}"
            class="px-2 pt-1.5 pb-1 text-xs font-semibold text-muted-foreground"
          >
            {group.label}
          </p>
        {/if}

        <ul
          class="flex flex-col gap-0.5"
          aria-labelledby={i > 0 ? `settings-group-${group.id}` : undefined}
        >
          {#each group.sections as section (section.slug)}
            {@const isActive = activeSlug === section.slug}
            <li>
              <a
                href="/dashboard/settings/{section.slug}"
                aria-current={isActive ? 'page' : undefined}
                class="{ITEM} text-foreground {isActive
                  ? 'bg-accent font-semibold'
                  : 'hover:bg-accent/70'}"
              >
                {#if isActive}
                  <span
                    class="absolute inset-y-1 -left-2 w-1 rounded-full bg-primary"
                    aria-hidden="true"
                  ></span>
                {/if}
                <section.icon
                  size={16}
                  strokeWidth={1.75}
                  class="shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                {section.label}
              </a>
            </li>
          {/each}
        </ul>
      {/each}

      <div class="my-2 border-t border-panel-border"></div>
      <button
        type="button"
        onclick={() => (confirmSignOut = true)}
        disabled={signingOut}
        class="{ITEM} cursor-pointer disabled:cursor-default text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
      >
        {@render signOutIcon()}
        Вийти
      </button>
    </nav>

    <div class="min-w-0 max-w-3xl flex-1">
      <h1
        class="mb-6 border-b border-panel-border pb-2 text-2xl font-normal tracking-[-0.01em]"
      >
        {sectionLabel}
      </h1>

      {@render children()}
    </div>
  </div>
</div>

<!-- Діалог той самий, що й «Видалити фото профілю?». Дія червона, як і
     пункт меню; «Скасувати» лишається на місці. Під час виходу обидві
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
