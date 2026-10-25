<script lang="ts">
  // Покроковий онбординг — рамка, спільна для майстра й замовника.
  //
  // Один екран — одне питання, як у Upwork, Airbnb чи Thumbtack: довга
  // анкета з восьми полів лякає ще до першого символу, а коротке питання
  // з поясненням «навіщо» заповнюється майже само. Угорі — прогрес по
  // кроках (видно, скільки лишилось), унизу — «Назад» і «Далі»; на
  // необовʼязкових кроках ще й «Пропустити».
  //
  // Рамка нічого не знає про поля: вміст кроку малює батько через сніпет,
  // він же перевіряє крок (validate) і зберігає профіль (onSubmit). Тож
  // стан, перевірки й запит лишаються в одному місці з формою
  // редагування профілю в налаштуваннях.
  import { tick, type Snippet } from 'svelte'
  import { fly } from 'svelte/transition'
  import { prefersReducedMotion } from 'svelte/motion'
  import { ArrowLeft } from 'lucide-svelte'
  import { ZunorMarkAnimated } from '$lib/components/icons'
  import { Button } from '$lib/components/ui/button'
  import { Spinner } from '$lib/components/ui/spinner'
  import { setSettingsLayout } from '$lib/components/settings'
  import type { WizardStep } from './types'

  interface Props {
    steps: readonly WizardStep[]
    /** Індекс поточного кроку. Двосторонній: «Змінити» на кроці перевірки веде назад сюди ж. */
    current?: number
    /**
     * Перевірка кроку перед «Далі». false — лишаємось на кроці; помилки
     * під полями батько вже підсвітив, позначивши їх «торкнутими».
     */
    validate: (id: string) => boolean
    /** «Назад» на першому кроці — до вибору ролі. */
    onExit: () => void
    onSubmit: () => void | Promise<void>
    /** Напис на кнопці останнього кроку. */
    submitLabel: string
    /** Іде завантаження фото або збереження — кнопки чекають. */
    busy: boolean
    submitting: boolean
    /** Пояснення біля кнопок, поки busy, — чому «Далі» не натискається. */
    busyNote?: string
    step: Snippet<[string]>
  }

  let {
    steps,
    current = $bindable(0),
    validate,
    onExit,
    onSubmit,
    submitLabel,
    busy,
    submitting,
    busyNote = '',
    step: stepContent,
  }: Props = $props()

  // Поля всередині кроків — підпис над полем, без картки: та сама подача,
  // що на сторінці налаштувань.
  setSettingsLayout('split')

  const active = $derived(steps[current])
  const isLast = $derived(current === steps.length - 1)

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
</script>

<div class="flex min-h-svh flex-col bg-background">
  <!-- ─── Шапка: знак, лічильник, прогрес ─── -->
  <header class="sticky top-0 z-10 bg-background/90 backdrop-blur-md">
    <div
      class="mx-auto flex h-14 w-full max-w-[480px] items-center justify-between px-5"
    >
      <ZunorMarkAnimated animation="blink" class="block h-7 text-foreground" />
      <span class="text-[13px] text-muted-foreground tabular-nums">
        Крок {current + 1} з {steps.length}
      </span>
    </div>

    <!-- Відрізки, а не суцільна смуга: видно не лише «скільки», а й
         «скільки кроків ще», — це й заспокоює. -->
    <div
      class="mx-auto flex w-full max-w-[480px] gap-1 px-5 pb-3"
      role="progressbar"
      aria-label="Прогрес заповнення профілю"
      aria-valuemin={1}
      aria-valuemax={steps.length}
      aria-valuenow={current + 1}
    >
      {#each steps as s, i (s.id)}
        <span
          class="h-1 flex-1 rounded-full transition-colors duration-300 {i <=
          current
            ? 'bg-primary'
            : 'bg-border'}"
        ></span>
      {/each}
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
    <div class="mx-auto w-full max-w-[480px] flex-1 px-5 pt-8 pb-12 sm:pt-12">
      {#key current}
        <div
          in:fly={{
            y: prefersReducedMotion.current ? 0 : 8,
            duration: prefersReducedMotion.current ? 0 : 220,
          }}
        >
          <h1
            bind:this={heading}
            tabindex="-1"
            class="text-[24px] leading-tight font-semibold tracking-[-0.02em] outline-none"
          >
            {active.title}
          </h1>
          <p class="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            {active.subtitle}
          </p>

          <div class="mt-7">
            {@render stepContent(active.id)}
          </div>
        </div>
      {/key}
    </div>

    <!-- ─── Дії ───
         Прибиті до низу екрана: на телефоні кнопка «Далі» завжди під
         пальцем, хоч би яким довгим був крок. -->
    <footer
      class="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur-md"
    >
      <div
        class="mx-auto flex h-16 w-full max-w-[480px] items-center gap-2 px-5"
      >
        <Button
          type="button"
          variant="ghost"
          onclick={back}
          disabled={submitting}
          class="-ms-2.5 font-medium text-muted-foreground"
        >
          <ArrowLeft aria-hidden="true" />
          Назад
        </Button>

        {#if busyNote}
          <span class="truncate text-[12px] text-muted-foreground">
            {busyNote}
          </span>
        {/if}

        <span class="ms-auto"></span>

        {#if active.optional}
          <Button
            type="button"
            variant="ghost"
            onclick={skip}
            disabled={busy}
            class="font-medium text-muted-foreground"
          >
            Пропустити
          </Button>
        {/if}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={busy}
          aria-busy={submitting}
          class="relative min-w-27.5"
        >
          {#if submitting}
            <Spinner class="animate-spin" aria-hidden="true" />
            <span class="sr-only">Зберігаємо...</span>
          {:else}
            {isLast ? submitLabel : 'Далі'}
          {/if}
        </Button>
      </div>
    </footer>
  </form>
</div>
