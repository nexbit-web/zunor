<script lang="ts">
  // Вибір теми картками-мініатюрами застосунку: рамка, рейка, блок
  // контенту. Три варіанти замість двох плюс тумблер «Авто»: «Системна» —
  // це третій режим, а не модифікатор до перших двох.
  //
  // Мініатюри намальовані тут, а не картинками: акцентні деталі в них
  // беруть поточний --primary, тож зміна кольору в палітрі поруч одразу
  // видна і в превʼю теми.

  import { userPrefersMode } from 'mode-watcher'
  import { switchTheme } from '$lib/theme-transition'
  import { cn } from '$lib/utils'
  import { appearance } from '$lib/stores/appearance.svelte'
  import { nextRadioIndex } from './radio-keys'

  type Mode = 'light' | 'dark' | 'system'
  type Tone = 'light' | 'dark'

  interface Option {
    value: Mode
    label: string
    /** Для скрінрідера: саме «Світла» без контексту нічого не пояснює. */
    hint: string
  }

  // Порядок як у macOS: світла, темна, системна.
  const OPTIONS: readonly Option[] = [
    { value: 'light', label: 'Світла', hint: 'Світла тема' },
    { value: 'dark', label: 'Темна', hint: 'Темна тема' },
    {
      value: 'system',
      label: 'Системна',
      hint: 'Системна тема — як на пристрої',
    },
  ]

  // Кольори мініатюр сталі, а не токени: превʼю світлої теми мусить
  // лишатись світлим і тоді, коли зараз увімкнена темна. Значення — ті
  // самі, що в layout.css для відповідної теми.
  const TONES = {
    light: {
      frame: '#f6f6f7',
      panel: '#ffffff',
      rail: '#eaeaed',
      line: '#e6e6e7',
      strong: '#d6d6d8',
    },
    dark: {
      frame: '#141414',
      panel: '#222222',
      rail: '#2e2e2e',
      line: '#323232',
      strong: '#3e3e3e',
    },
  } as const

  // userPrefersMode — це вибір КОРИСТУВАЧА ('light' | 'dark' | 'system'),
  // на відміну від mode, який віддає вже обчислену тему. Потрібен саме
  // вибір, інакше при 'system' підсвічувалась би не та картка.
  const current = $derived((userPrefersMode.current ?? 'system') as Mode)

  // Посилання на кнопки — щоб стрілки могли переносити фокус.
  let buttons = $state<(HTMLButtonElement | undefined)[]>([])

  // Без цього role="radio" був обіцянкою, якої компонент не виконував:
  // скрінрідер оголошував радіогрупу, а стрілки не робили нічого.
  function handleKeydown(e: KeyboardEvent, index: number): void {
    const next = nextRadioIndex(e.key, index, OPTIONS.length)
    if (next === null) return

    e.preventDefault()
    switchTheme(OPTIONS[next].value, buttons[next])
    buttons[next]?.focus()
  }
</script>

<!-- Мініатюра застосунку: рамка, рейка з трьома пунктами (перший —
     активний), блок контенту з двома рядками. fill-primary — поточний
     акцент; data-tone дає йому тон самої мініатюри (для чорно-білого
     акценту це чорний на світлій і білий на темній, див. layout.css). -->
{#snippet mock(tone: Tone)}
  {@const c = TONES[tone]}
  <svg
    viewBox="0 0 160 90"
    class="block size-full"
    data-accent={appearance.accent}
    data-tone={tone}
    aria-hidden="true"
  >
    <rect width="160" height="90" fill={c.frame} />
    <rect x="8" y="10" width="8" height="8" rx="2" class="fill-primary" />
    <rect x="8" y="23" width="8" height="8" rx="2" fill={c.rail} />
    <rect x="8" y="36" width="8" height="8" rx="2" fill={c.rail} />
    <rect x="24" y="6" width="130" height="90" rx="6" fill={c.panel} />
    <rect x="34" y="18" width="24" height="5" rx="2.5" fill={c.strong} />
    <rect x="62" y="18" width="18" height="5" rx="2.5" class="fill-primary" />
    <rect x="138" y="18" width="6" height="5" rx="2" fill={c.line} />
    <circle cx="37" cy="37.5" r="2.5" class="fill-primary" />
    <rect x="44" y="35" width="28" height="5" rx="2.5" fill={c.line} />
    <rect x="76" y="35" width="28" height="5" rx="2.5" fill={c.line} />
    <rect x="34" y="50" width="70" height="5" rx="2.5" fill={c.line} />
  </svg>
{/snippet}

<!-- Roving tabindex: у групу один вхід табом, далі стрілками. Інакше три
     кнопки поспіль змушували б тричі тиснути Tab, щоб проминути блок. -->
<!-- Ширину задає рядок, у якому стоїть група (SettingsRow wide); сама
     група лише ділить її на три. -->
<div
  role="radiogroup"
  aria-label="Тема оформлення"
  class="grid w-full max-w-135 grid-cols-3 gap-3 @3xl:w-120"
>
  {#each OPTIONS as opt, i (opt.value)}
    {@const selected = current === opt.value}
    <button
      bind:this={buttons[i]}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={opt.hint}
      tabindex={selected ? 0 : -1}
      onclick={(e) => switchTheme(opt.value, e.currentTarget)}
      onkeydown={(e) => handleKeydown(e, i)}
      class="group flex min-w-0 cursor-pointer flex-col items-center gap-2 rounded-[10px] outline-none"
    >
      <!-- Обрана — майже чорна (у темній — майже біла) рамка кольору
           тексту з проміжком, як у ClickUp: акцентна рамка сперечалась
           би з акцентом у самій мініатюрі. Невибрані мають тонку межу:
           світле превʼю на білому тлі без неї зливалося б зі сторінкою. -->
      <span
        class={cn(
          'relative block aspect-video w-full overflow-hidden rounded-[10px] ring-offset-2 ring-offset-background transition-shadow',
          selected
            ? 'ring-2 ring-foreground'
            : 'ring-1 ring-border group-hover:ring-input group-focus-visible:ring-2 group-focus-visible:ring-foreground/60',
        )}
      >
        {#if opt.value === 'system'}
          <!-- «Системна» — дві теми навпіл: ліва половина світла,
               права темна. -->
          <span class="absolute inset-0 [clip-path:inset(0_50%_0_0)]">
            {@render mock('light')}
          </span>
          <span class="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
            {@render mock('dark')}
          </span>
        {:else}
          {@render mock(opt.value)}
        {/if}
      </span>

      <!-- Невибрані підписи приглушені: інакше всі три виглядають
           однаково активними. -->
      <span
        class={cn(
          'text-[14px] transition-colors',
          selected
            ? 'font-semibold text-foreground'
            : 'text-muted-foreground group-hover:text-foreground',
        )}
      >
        {opt.label}
      </span>
    </button>
  {/each}
</div>
