<script lang="ts">
  // Налаштування як модалка ПОВЕРХ поточної сторінки: рейка розділів
  // ліворуч, вміст праворуч (форма блока sidebar-13, мова — наша: ті
  // самі кольорові плитки іконок, той самий синій активного рядка, ті
  // самі картки SettingsGroup усередині).
  //
  // Чому модалка живе в лейауті дашборда, а не в /settings/+layout:
  // сторінка замінила б собою фон, а весь сенс — лишити під модалкою те,
  // чим користувач зайнятий. URL при цьому не міняється, як у ChatGPT.
  //
  // Розділи лишились справжніми маршрутами: їхні +page.server.ts
  // виконуються через preloadData, а +page.svelte підвантажується ліниво.
  // Тобто дублювання «сторінка окремо, модалка окремо» тут немає —
  // джерело одне.

  import { untrack, type Component } from 'svelte'
  import { preloadData, goto } from '$app/navigation'
  import { page } from '$app/state'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { sectionsForRole, DEFAULT_SECTION } from '$lib/components/settings'
  import { settingsDialog } from '$lib/stores/settings-dialog.svelte'

  type SectionModule = { default: Component<Record<string, unknown>> }

  // Ліниво: інакше кожен вхід на дашборд тягнув би код усіх розділів,
  // включно з важким онбордингом у «Профілі».
  const modules = import.meta.glob('./settings/*/+page.svelte') as Record<
    string,
    () => Promise<SectionModule>
  >

  let SectionComponent = $state<Component<Record<string, unknown>> | null>(null)
  let sectionData = $state<Record<string, unknown> | undefined>(undefined)
  let pending = $state(false)
  let failed = $state(false)

  // Захист від гонки: користувач може клацати по рейці швидше, ніж
  // відповідає сервер, і відповідь на попередній розділ не має
  // перемальовувати вже обраний.
  let requestId = 0

  const user = $derived(page.data.session?.user)
  const role = $derived(page.data.role ?? null)
  const sections = $derived(sectionsForRole(role))

  const activeSlug = $derived(settingsDialog.slug)
  const isProfileActive = $derived(activeSlug === 'profile')

  // Ініціал як запасний аватар: у Google-акаунтів фото є завжди,
  // у зареєстрованих поштою — ні.
  const initial = $derived(
    (user?.name ?? user?.email ?? '?').charAt(0).toUpperCase(),
  )

  const roleLabel = $derived(role === 'MASTER' ? 'Виконавець' : 'Замовник')

  // 'Профіль' окремо: картка профілю не входить у рейку розділів.
  const sectionLabel = $derived(
    isProfileActive
      ? 'Профіль'
      : (sections.find((s) => s.slug === activeSlug)?.label ?? 'Налаштування'),
  )

  /** Slug із адреси, куди редіректнув серверний load розділу. */
  function slugOf(location: string): string | null {
    const path = new URL(location, window.location.origin).pathname
    if (!path.startsWith('/dashboard/settings/')) return null
    return path.slice('/dashboard/settings/'.length).split('/')[0] || null
  }

  async function loadSection(slug: string): Promise<void> {
    const id = ++requestId
    const loader = modules[`./settings/${slug}/+page.svelte`]

    if (!loader) {
      settingsDialog.slug = DEFAULT_SECTION
      return
    }

    pending = true
    failed = false

    try {
      // Дані — рідним завантажувачем розділу, розмітка — його ж
      // +page.svelte. Обидва беруться паралельно: вони не залежать
      // одне від одного.
      const [result, module] = await Promise.all([
        preloadData(`/dashboard/settings/${slug}`),
        loader(),
      ])

      if (id !== requestId) return

      if (result.type === 'redirect') {
        // Гард розділу відхилив: майстер в «AI асистента», непройдений
        // онбординг у «Профіль». Якщо ведуть в інший розділ — просто
        // переходимо на нього, модалку не закриваємо.
        const next = slugOf(result.location)

        if (next) settingsDialog.slug = next
        else {
          settingsDialog.hide()
          await goto(result.location)
        }
        return
      }

      if (result.status >= 400) {
        failed = true
        return
      }

      sectionData = result.data as Record<string, unknown>
      SectionComponent = module.default
    } catch {
      // Обрив мережі або невдалий чанк. Мовчазна порожня модалка гірша
      // за явне «не вийшло» з кнопкою повтору.
      if (id === requestId) failed = true
    } finally {
      if (id === requestId) pending = false
    }
  }

  $effect(() => {
    if (!settingsDialog.open) return

    const slug = settingsDialog.slug

    untrack(() => {
      // Показувати вміст попереднього розділу під новим заголовком не
      // можна — на секунду це виглядає як чужі налаштування.
      SectionComponent = null
      sectionData = undefined
      void loadSection(slug)
    })
  })

  function onOpenChange(open: boolean): void {
    if (!open) settingsDialog.hide()
  }
</script>

<Dialog.Root open={settingsDialog.open} {onOpenChange}>
  <Dialog.Content
    class="flex h-[92dvh] w-full max-w-[calc(100%-1rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:h-160 sm:max-h-[88vh] sm:max-w-200 lg:max-w-225"
  >
    <Dialog.Description class="sr-only">
      Профіль, вигляд, сповіщення та безпека акаунта.
    </Dialog.Description>

    <!-- ─── Рейка розділів (десктоп) ───
         Власна колонка, а не Sidebar.Provider: провайдер уже стоїть
         навколо всього дашборда, і другий усередині модалки перебивав би
         його стан і cookie згорнутості. -->
    <aside
      class="hidden w-56 shrink-0 flex-col overflow-y-auto border-r border-border/60 bg-muted/30 p-3 md:flex"
    >
      <!-- ─── Картка профілю ───
           Аватар більший за плитки розділів: акаунт — не такий самий
           пункт списку, а те, до чого решта налаштувань належить. -->
      <button
        type="button"
        onclick={() => settingsDialog.show('profile')}
        aria-current={isProfileActive ? 'page' : undefined}
        class="mb-2 flex items-center gap-3 rounded-lg p-2 text-start transition-colors {isProfileActive
          ? 'bg-[#2b63da] text-white'
          : 'hover:bg-accent/50'}"
      >
        {#if user?.image}
          <img
            src={user.image}
            alt=""
            class="size-9 shrink-0 rounded-full object-cover"
          />
        {:else}
          <span
            class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground"
          >
            {initial}
          </span>
        {/if}

        <span class="min-w-0">
          <span class="block truncate text-[13.5px] font-medium">
            {user?.name ?? 'Профіль'}
          </span>
          <span class="block truncate text-[11.5px]">
            {roleLabel}
          </span>
        </span>
      </button>

      <nav class="flex flex-col gap-1" aria-label="Розділи налаштувань">
        {#each sections as section (section.slug)}
          {@const isActive = activeSlug === section.slug}
          <button
            type="button"
            onclick={() => settingsDialog.show(section.slug)}
            aria-current={isActive ? 'page' : undefined}
            class="flex shrink-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-start text-[13.5px] whitespace-nowrap transition-colors {isActive
              ? 'bg-[#2b63da] font-medium text-white'
              : 'text-foreground/80 hover:bg-accent/50'}"
          >
            <span
              class="flex size-[22px] shrink-0 items-center justify-center rounded-[6px] text-white {section.tile}"
            >
              <section.icon size={13} strokeWidth={2} aria-hidden="true" />
            </span>
            {section.label}
          </button>
        {/each}
      </nav>
    </aside>

    <!-- ─── Вміст розділу ─── -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- pr-12: під кнопку закриття, яку малює сам Dialog.Content.
           Роздільної лінії під шапкою немає навмисно: рейка вже
           відокремлена фоном, і друга межа різала б модалку на клапті. -->
      <header
        class="flex h-14 shrink-0 items-center px-4 pr-12 sm:px-5 sm:pr-12"
      >
        <Dialog.Title
          class="truncate text-[15px] font-semibold tracking-[-0.02em]"
        >
          {sectionLabel}
        </Dialog.Title>
      </header>

      <!-- ─── Рейка розділів (мобільний) ───
           Горизонтальна смуга замість drill-down: у модалці на вузькому
           екрані переходу «назад до списку» нема куди вести. Профіль тут
           перший чіп — окремої картки для нього в цій подачі немає. -->
      <nav
        class="flex shrink-0 gap-1 overflow-x-auto border-b border-border/60 px-3 py-2 md:hidden"
        aria-label="Розділи налаштувань"
      >
        <button
          type="button"
          onclick={() => settingsDialog.show('profile')}
          aria-current={isProfileActive ? 'page' : undefined}
          class="flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-[13.5px] whitespace-nowrap transition-colors {isProfileActive
            ? 'bg-[#2b63da] font-medium text-white'
            : 'text-foreground/80 hover:bg-accent/50'}"
        >
          {#if user?.image}
            <img
              src={user.image}
              alt=""
              class="size-[22px] shrink-0 rounded-full object-cover"
            />
          {:else}
            <span
              class="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground"
            >
              {initial}
            </span>
          {/if}
          Профіль
        </button>

        {#each sections as section (section.slug)}
          {@const isActive = activeSlug === section.slug}
          <button
            type="button"
            onclick={() => settingsDialog.show(section.slug)}
            aria-current={isActive ? 'page' : undefined}
            class="flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-[13.5px] whitespace-nowrap transition-colors {isActive
              ? 'bg-[#2b63da] font-medium text-white'
              : 'text-foreground/80 hover:bg-accent/50'}"
          >
            <span
              class="flex size-[22px] shrink-0 items-center justify-center rounded-[6px] text-white {section.tile}"
            >
              <section.icon size={13} strokeWidth={2} aria-hidden="true" />
            </span>
            {section.label}
          </button>
        {/each}
      </nav>

      <div class="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {#if failed}
          <div
            class="flex h-full flex-col items-center justify-center gap-3 text-center"
          >
            <p class="text-sm text-muted-foreground">
              Не вдалося відкрити розділ. Схоже, зникла мережа.
            </p>
            <button
              type="button"
              class="rounded-md bg-[#2b63da] px-3 py-1.5 text-[13.5px] font-medium text-white"
              onclick={() => loadSection(activeSlug)}
            >
              Спробувати ще раз
            </button>
          </div>
        {:else if SectionComponent}
          <SectionComponent data={sectionData} />
        {:else if pending}
          <!-- Скелет під форму картки: без нього модалка стрибає з
               порожнечі одразу в повний вміст. -->
          <div class="space-y-3">
            <div class="h-4 w-24 animate-pulse rounded bg-muted"></div>
            <div class="h-28 animate-pulse rounded-xl bg-muted/60"></div>
            <div class="h-4 w-32 animate-pulse rounded bg-muted"></div>
            <div class="h-20 animate-pulse rounded-xl bg-muted/60"></div>
          </div>
        {/if}
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
