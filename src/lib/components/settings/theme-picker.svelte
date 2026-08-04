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
  }

  // Порядок як у macOS: світла, темна, системна.
  const OPTIONS: readonly Option[] = [
    { value: 'light', label: 'Світла' },
    { value: 'dark', label: 'Темна' },
    { value: 'system', label: 'Системна' },
  ]

  // userPrefersMode — це вибір КОРИСТУВАЧА ('light' | 'dark' | 'system'),
  // на відміну від mode, який віддає вже обчислену тему. Потрібен саме
  // вибір, інакше при 'system' підсвічувалась би не та картка.
  const current = $derived((userPrefersMode.current ?? 'system') as Mode)
</script>

<div role="radiogroup" aria-label="Тема оформлення" class="flex gap-3 sm:gap-5">
  {#each OPTIONS as opt (opt.value)}
    {@const selected = current === opt.value}
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onclick={() => setMode(opt.value)}
      class="group flex flex-1 cursor-pointer flex-col items-center gap-2 rounded-lg p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <!-- Превʼю. ring на вибраній картці читається як «обрано»
           швидше, ніж колір підпису. -->
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
          class="block aspect-[68/35] w-full"
        />
      </span>

      <span class="text-[13px] font-medium">{opt.label}</span>

      <!-- Кружечок дублює ring навмисно: саме він каже, що це
           перемикач, а не просто картинка. -->
      <span
        class={cn(
          'flex size-5 items-center justify-center rounded-full border transition-colors',
          selected
            ? 'border-foreground bg-foreground text-background'
            : 'border-border',
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
