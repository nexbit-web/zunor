<script lang="ts">
  // Вибір теми картками, як у системних налаштуваннях: превʼю → підпис →
  // кружечок вибору. Три варіанти замість двох плюс тумблер «Авто»:
  // «Системна» — це третій режим, а не модифікатор до перших двох.

  import { userPrefersMode, setMode } from 'mode-watcher'
  import { Check } from 'lucide-svelte'
  import { cn } from '$lib/utils'

  type Mode = 'light' | 'dark' | 'system'

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

  // userPrefersMode — це вибір КОРИСТУВАЧА ('light' | 'dark' | 'system'),
  // на відміну від mode, який віддає вже обчислену тему. Потрібен саме
  // вибір, інакше при 'system' підсвічувалась би не та картка.
  const current = $derived((userPrefersMode.current ?? 'system') as Mode)

  // Посилання на кнопки — щоб стрілки могли переносити фокус.
  let buttons = $state<(HTMLButtonElement | undefined)[]>([])

  /**
   * Клавіатура радіогрупи за APG: стрілки одразу ПЕРЕМИКАЮТЬ і переносять
   * фокус, Home/End — на краї, рух по колу.
   *
   * Без цього role="radio" був обіцянкою, якої компонент не виконував:
   * скрінрідер оголошував радіогрупу, а стрілки не робили нічого.
   */
  function handleKeydown(e: KeyboardEvent, index: number): void {
    const last = OPTIONS.length - 1
    let next: number

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = index === last ? 0 : index + 1
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        next = index === 0 ? last : index - 1
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = last
        break
      default:
        return
    }

    e.preventDefault()
    setMode(OPTIONS[next].value)
    buttons[next]?.focus()
  }
</script>

<!-- Roving tabindex: у групу один вхід табом, далі стрілками. Інакше три
     кнопки поспіль змушували б тричі тиснути Tab, щоб проминути блок. -->
<div role="radiogroup" aria-label="Тема оформлення" class="flex gap-3 sm:gap-5">
  {#each OPTIONS as opt, i (opt.value)}
    {@const selected = current === opt.value}
    <button
      bind:this={buttons[i]}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={opt.hint}
      tabindex={selected ? 0 : -1}
      onclick={() => setMode(opt.value)}
      onkeydown={(e) => handleKeydown(e, i)}
      class="group flex flex-1 cursor-pointer flex-col items-center gap-2 rounded-lg p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <!-- Превʼю. ring на вибраній картці читається як «обрано»
           швидше, ніж колір підпису. Власна рамка на картинці — щоб
           світле превʼю не зливалося з фоном у світлій темі. -->
      <span
        class={cn(
          'w-full overflow-hidden rounded-lg ring-2 ring-offset-2 ring-offset-background transition-all',
          selected
            ? 'ring-foreground'
            : 'ring-transparent group-hover:ring-border',
        )}
      >
        <img
          src="/theme/{opt.value}.svg"
          alt=""
          class="block aspect-[68/35] w-full rounded-lg border border-border/60"
        />
      </span>

      <!-- Невибрані підписи приглушені: інакше всі три виглядають
           однаково активними, і оком доводиться шукати кружечок. -->
      <span
        class={cn(
          'text-[13px] transition-colors',
          selected
            ? 'font-medium text-foreground'
            : 'text-muted-foreground group-hover:text-foreground',
        )}
      >
        {opt.label}
      </span>

      <!-- Кружечок дублює ring навмисно: саме він каже, що це
           перемикач, а не просто картинка. -->
      <span
        class={cn(
          'flex size-5 items-center justify-center rounded-full border transition-colors',
          selected
            ? 'border-foreground bg-foreground text-background'
            : 'border-border group-hover:border-foreground/40',
        )}
        aria-hidden="true"
      >
        {#if selected}
          <Check class="size-3" strokeWidth={3} />
        {/if}
      </span>
    </button>
  {/each}
</div>
