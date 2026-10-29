<script lang="ts">
  // Покроковий онбординг — рамка, спільна для майстра й замовника.
  //
  // Подача — як у анкеті господаря на Airbnb: одне питання на весь екран,
  // великим шрифтом і по центру; угорі лише знак і «Вийти», унизу —
  // смуга прогресу по ЕТАПАХ, «Назад» посиланням і «Далі». Логіка їхня,
  // а кольори й кнопки наші: смуга й «Далі» — акцентом із «Вигляду». Довга
  // анкета з дванадцяти полів лякає ще до першого символу, а коротке
  // питання з поясненням «навіщо» заповнюється майже само.
  //
  // Етапи (phases) необовʼязкові. Майстру вони ділять анкету на три теми з
  // заставками перед кожною й оглядом на початку — «другий етап із трьох»
  // заспокоює краще за «крок 9 з 16». Без етапів (замовник) смуга одна.
  //
  // Рамка нічого не знає про поля: вміст кроку малює батько через сніпет,
  // він же перевіряє крок (validate) і зберігає профіль (onSubmit). Тож
  // стан, перевірки й запит лишаються в одному місці з формою
  // редагування профілю в налаштуваннях.
  import { tick, type Snippet } from 'svelte'
  import { fly } from 'svelte/transition'
  import { prefersReducedMotion } from 'svelte/motion'
  import { ZunorMarkAnimated } from '$lib/components/icons'
  import { Button } from '$lib/components/ui/button'
  import { Spinner } from '$lib/components/ui/spinner'
  import { setSettingsLayout } from '$lib/components/settings'
  import type { WizardPhase, WizardStep } from './types'

  interface Props {
    steps: readonly WizardStep[]
    /** Етапи для смуги прогресу й заставок; без них смуга одна. */
    phases?: readonly WizardPhase[]
    /** Ілюстрація етапу за його id — на заставці й в огляді. */
    art?: Snippet<[string, 'lg' | 'sm']>
    /** Індекс поточного кроку. Двосторонній: «Змінити» на кроці перевірки веде назад сюди ж. */
    current?: number
    /**
     * Перевірка кроку перед «Далі». false — лишаємось на кроці; помилки
     * під полями батько вже підсвітив, позначивши їх «торкнутими».
     */
    validate: (id: string) => boolean
    /** «Вийти» в шапці й «Назад» на першому кроці — до вибору ролі. */
    onExit: () => void
    onSubmit: () => void | Promise<void>
    /** Напис на кнопці останнього кроку. */
    submitLabel: string
    /** Сторінка «як це працює» для тих, хто вагається; відкривається поруч. */
    helpHref?: string
    /** Іде завантаження фото або збереження — кнопки чекають. */
    busy: boolean
    submitting: boolean
    /** Пояснення біля кнопок, поки busy, — чому «Далі» не натискається. */
    busyNote?: string
    step: Snippet<[string]>
  }

  let {
    steps,
    phases = [],
    art,
    current = $bindable(0),
    validate,
    onExit,
    onSubmit,
    submitLabel,
    helpHref,
    busy,
    submitting,
    busyNote = '',
    step: stepContent,
  }: Props = $props()

  // Поля всередині кроків — підпис над полем, без картки: та сама подача,
  // що на сторінці налаштувань.
  setSettingsLayout('split')

  const active = $derived(steps[current])
  const kind = $derived(active.kind ?? 'step')
  const isLast = $derived(current === steps.length - 1)
  const phase = $derived(phases.find((p) => p.id === active.phase))
  const phaseNumber = $derived(phase ? phases.indexOf(phase) + 1 : 0)

  /**
   * Заповнення кожного відрізка: частка кроків етапу до поточного
   * включно. Без етапів — один відрізок на всю анкету.
   */
  const progress = $derived.by(() => {
    if (phases.length === 0) return [(current + 1) / steps.length]
    return phases.map((p) => {
      const own = steps.flatMap((s, i) => (s.phase === p.id ? [i] : []))
      if (own.length === 0) return 0
      return own.filter((i) => i <= current).length / own.length
    })
  })

  let heading = $state<HTMLHeadingElement | null>(null)
  let mounted = false

  // Новий крок — нова «сторінка»: прокрутка вгору й фокус на заголовок,
  // щоб скрінрідер прочитав питання, а не мовчав на кнопці «Далі».
  // На першому показі фокус не чіпаємо — сторінка щойно відкрилась.
  $effect(() => {
    void current
    if (!mounted) {
      mounted = true
      return
    }
    window.scrollTo({ top: 0 })
    tick().then(() => heading?.focus())
  })

  function next(): void {
    if (busy) return
    if (!validate(active.id)) return
    if (isLast) void onSubmit()
    else current += 1
  }

  // Пропуск не перевіряє крок: він необовʼязковий за визначенням. З
  // останнього кроку пропуск означає «зберегти без цього».
  function skip(): void {
    if (busy) return
    if (isLast) void onSubmit()
    else current += 1
  }

  function back(): void {
    if (submitting) return
    if (current === 0) onExit()
    else current -= 1
  }

  const nextLabel = $derived(
    isLast ? submitLabel : kind === 'overview' ? 'Почати' : 'Далі',
  )
</script>

<div class="flex min-h-svh flex-col bg-background">
  <!-- ─── Шапка: знак і вихід. Лічильника кроків немає навмисно: прогрес
       живе внизу, біля кнопки, на яку людина й дивиться. ─── -->
  <header
    class="flex h-14 shrink-0 items-center justify-between px-5 sm:h-16 sm:px-10 lg:px-12"
  >
    <ZunorMarkAnimated
      animation="blink"
      class="block h-7 text-foreground sm:h-8"
    />
    <div class="flex items-center gap-2">
      {#if helpHref}
        <a href={helpHref} target="_blank" rel="noopener" class="pill">
          Як це працює?
        </a>
      {/if}
      <button type="button" class="pill" onclick={onExit} disabled={submitting}>
        Вийти
      </button>
    </div>
  </header>

  <!-- Enter у будь-якому полі = «Далі»: форма на кожен крок одна. -->
  <form
    class="flex flex-1 flex-col"
    novalidate
    onsubmit={(e) => {
      e.preventDefault()
      next()
    }}
  >
    <!-- По центру екрана — лише заставки й огляд. Питання стоїть угорі, під
         шапкою: відцентроване, на високому екрані воно відʼїжджало від неї
         на третину висоти, і погляд починав з порожнечі. -->
    <main
      class={[
        'flex flex-1 px-5 sm:px-10',
        kind !== 'step' && 'md:items-center',
      ]}
    >
      {#key current}
        <div
          class={[
            'mx-auto w-full',
            kind === 'step'
              ? 'max-w-160 pt-4 pb-8 sm:pt-8'
              : 'max-w-5xl py-6 sm:py-10',
          ]}
          in:fly={{
            y: prefersReducedMotion.current ? 0 : 10,
            duration: prefersReducedMotion.current ? 0 : 280,
          }}
        >
          {#if kind === 'overview'}
            <!-- Огляд: що буде далі, трьома рядками. Людина бачить кінець
                 анкети ще до першого питання. -->
            <div class="grid items-center gap-10 md:grid-cols-2 md:gap-16">
              <h1
                bind:this={heading}
                tabindex="-1"
                class="text-[34px] leading-[1.08] font-semibold tracking-[-0.03em] outline-none sm:text-[48px]"
              >
                {active.title}
              </h1>
              <ol>
                {#each phases as p, i (p.id)}
                  <li
                    class="flex items-start gap-4 border-b border-border py-6 first:pt-0 last:border-b-0 sm:gap-5"
                  >
                    <span
                      class="w-6 shrink-0 text-[20px] leading-tight font-semibold"
                    >
                      {i + 1}
                    </span>
                    <span class="min-w-0 flex-1">
                      <span
                        class="block text-[19px] leading-tight font-semibold tracking-[-0.01em]"
                      >
                        {p.title}
                      </span>
                      <span
                        class="mt-1.5 block text-[15px] leading-relaxed text-muted-foreground"
                      >
                        {p.lead}
                      </span>
                    </span>
                    {#if art}{@render art(p.id, 'sm')}{/if}
                  </li>
                {/each}
              </ol>
            </div>
          {:else if kind === 'intro' && phase}
            <!-- Заставка етапу: «Етап 2», тема й навіщо вона. Ілюстрація на
                 телефоні — першою: вона й каже, про що етап. -->
            <div class="grid items-center gap-8 md:grid-cols-2 md:gap-16">
              <div>
                <p class="text-[16px] font-semibold">Етап {phaseNumber}</p>
                <h1
                  bind:this={heading}
                  tabindex="-1"
                  class="mt-3 text-[34px] leading-[1.08] font-semibold tracking-[-0.03em] outline-none sm:text-[46px]"
                >
                  {phase.title}
                </h1>
                <p
                  class="mt-5 max-w-md text-[17px] leading-relaxed text-muted-foreground"
                >
                  {phase.lead}
                </p>
              </div>
              {#if art}
                <div class="order-first md:order-0">
                  {@render art(phase.id, 'lg')}
                </div>
              {/if}
            </div>
          {:else}
            <h1
              bind:this={heading}
              tabindex="-1"
              class="text-[26px] leading-tight font-semibold tracking-[-0.02em] outline-none sm:text-[32px]"
            >
              {active.title}
            </h1>
            <p
              class="mt-2.5 text-[15px] leading-relaxed text-muted-foreground sm:text-[16px]"
            >
              {active.subtitle}
            </p>

            <div class="mt-8">
              {@render stepContent(active.id)}
            </div>
          {/if}
        </div>
      {/key}
    </main>

    <!-- ─── Низ: прогрес по етапах і дії ───
         Прибитий до низу екрана: на телефоні «Далі» завжди під пальцем,
         хоч би яким довгим був крок. -->
    <footer class="sticky bottom-0 bg-background">
      <div
        class="flex gap-2"
        role="progressbar"
        aria-label="Прогрес заповнення профілю"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={current + 1}
      >
        {#each progress as share, i (i)}
          <span class="h-1 flex-1 overflow-hidden rounded-full bg-primary/15">
            <span
              class="block h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style:width="{Math.round(share * 100)}%"
            ></span>
          </span>
        {/each}
      </div>

      <div class="flex h-14 items-center gap-3 px-5 sm:h-16 sm:px-10 lg:px-12">
        <button
          type="button"
          onclick={back}
          disabled={submitting}
          class="link-btn"
        >
          Назад
        </button>

        {#if busyNote}
          <span class="truncate text-[12px] text-muted-foreground">
            {busyNote}
          </span>
        {/if}

        <span class="ms-auto"></span>

        {#if active.optional}
          <button type="button" onclick={skip} disabled={busy} class="link-btn">
            Пропустити
          </button>
        {/if}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={busy}
          aria-busy={submitting}
          class="relative min-w-28 px-6"
        >
          {#if submitting}
            <Spinner class="animate-spin" aria-hidden="true" />
            <span class="sr-only">Зберігаємо...</span>
          {:else}
            {nextLabel}
          {/if}
        </Button>
      </div>
    </footer>
  </form>
</div>

<style>
  /* Кнопки-пігулки в шапці: тонка рамка, без заливки, як навігація.
     Під курсором — акцент, як і решта інтерактивного на екрані. */
  .pill {
    display: inline-flex;
    align-items: center;
    height: 36px;
    padding-inline: 16px;
    border: 1px solid var(--border);
    border-radius: 9999px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition:
      border-color 150ms ease,
      color 150ms ease;
  }
  .pill:hover:not(:disabled) {
    border-color: var(--primary);
    color: var(--primary);
  }
  .pill:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .pill:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  /* «Назад» і «Пропустити» — посиланням, а не другою кнопкою: головна дія
     на екрані одна, решта не має з нею сперечатися за увагу. */
  .link-btn {
    padding: 8px 4px;
    margin-inline: -4px;
    border-radius: 6px;
    font-size: 15px;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 4px;
    text-decoration-thickness: 1px;
    cursor: pointer;
  }
  .link-btn:hover {
    text-decoration-thickness: 2px;
  }
  .link-btn:focus-visible {
    outline: 2px solid var(--ring);
  }
  .link-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
</style>
