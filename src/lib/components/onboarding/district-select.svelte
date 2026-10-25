<!--
  Вибір району міста — той самий комбобокс, що й вибір міста (Popover +
  Command), щоб на одному кроці два поля поводились однаково. Пошук за
  назвою; угорі райони міста, нижче — передмістя.

  Список — райони обраного міста з БД, які сторінка вже отримала в load:
  зміна міста не потребує нового запиту.
-->
<script lang="ts">
  import { tick } from 'svelte'
  import { Button } from '$lib/components/ui/button'
  import * as Popover from '$lib/components/ui/popover'
  import * as Command from '$lib/components/ui/command'
  import { cn } from '$lib/utils'
  import { findDistrict, type District } from '$lib/geo/districts'
  import CheckIcon from '@lucide/svelte/icons/check'
  import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down'
  import { House } from 'lucide-svelte'

  interface Props {
    /** Райони обраного міста. */
    districts: readonly District[]
    value?: string
    id?: string
    invalid?: boolean
    /** Людина щось обрала — батько позначає поле «торкнутим». */
    onpick?: () => void
  }

  let {
    districts,
    value = $bindable(''),
    id = 'district',
    invalid = false,
    onpick,
  }: Props = $props()

  let open = $state(false)
  let triggerRef = $state<HTMLButtonElement>(null!)

  const groups = $derived(
    [
      { heading: 'Місто', items: districts.filter((d) => d.group === 'CITY') },
      {
        heading: 'Передмістя',
        items: districts.filter((d) => d.group === 'SUBURB'),
      },
    ].filter((g) => g.items.length > 0),
  )

  const selectedName = $derived(findDistrict(districts, value)?.name ?? '')

  function pick(slug: string): void {
    value = slug
    onpick?.()
    open = false
    // tick: поповер ще в DOM на момент виклику, фокус без нього не сяде.
    tick().then(() => triggerRef?.focus())
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger bind:ref={triggerRef}>
    {#snippet child({ props })}
      <Button
        {...props}
        {id}
        variant="outline"
        role="combobox"
        aria-expanded={open}
        aria-invalid={invalid}
        class="w-full cursor-pointer justify-between rounded-[10px] bg-background pl-3 font-normal focus-visible:border-input focus-visible:ring-0 aria-invalid:ring-0"
      >
        <span class="flex min-w-0 items-center gap-2">
          <House
            class="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span
            class={cn('truncate', !selectedName && 'text-muted-foreground')}
          >
            {selectedName || 'Оберіть район'}
          </span>
        </span>
        <ChevronsUpDownIcon class="opacity-50" />
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-(--bits-popover-anchor-width) p-0">
    <Command.Root>
      <Command.Input placeholder="Пошук району..." />
      <Command.List class="max-h-72">
        <Command.Empty>Район не знайдено</Command.Empty>
        {#each groups as g (g.heading)}
          <Command.Group heading={g.heading}>
            {#each g.items as d (d.slug)}
              <!-- value = назва: пошук іде по тому, що людина бачить -->
              <Command.Item
                value={d.name}
                class="cursor-pointer [&_.cn-command-item-indicator]:hidden"
                onSelect={() => pick(d.slug)}
              >
                {d.name}
                <CheckIcon
                  class={cn(
                    'ms-auto text-primary!',
                    value !== d.slug && 'text-transparent!',
                  )}
                />
              </Command.Item>
            {/each}
          </Command.Group>
        {/each}
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
