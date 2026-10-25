<script lang="ts">
  import { Command as CommandPrimitive } from 'bits-ui'
  import { cn } from '$lib/utils.js'
  import * as InputGroup from '$lib/components/ui/input-group/index.js'
  import SearchIcon from '@lucide/svelte/icons/search'

  let {
    ref = $bindable(null),
    class: className,
    value = $bindable(''),
    ...restProps
  }: CommandPrimitive.InputProps = $props()
</script>

<!--
  Рядок пошуку всередині списку — не окреме поле вводу: власна рамка,
  заливка й синє кільце на фокусі малювали «поле в полі» просто під
  кнопкою, яка це поле й відкрила. Лишаємо саму стрічку з лупою, а від
  списку її відділяє лінія знизу — фокус тут і так завжди в ній.
-->
<div data-slot="command-input-wrapper" class="border-b border-border/60 px-1">
  <InputGroup.Root
    class="h-10! rounded-none! border-0! bg-transparent! shadow-none! ring-0! *:data-[slot=input-group-addon]:pl-2!"
  >
    <CommandPrimitive.Input
      {value}
      data-slot="command-input"
      class={cn(
        'w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...restProps}
    >
      {#snippet child({ props })}
        <InputGroup.Input {...props} bind:value bind:ref />
      {/snippet}
    </CommandPrimitive.Input>
    <InputGroup.Addon>
      <SearchIcon class="size-4 shrink-0 opacity-50" />
    </InputGroup.Addon>
  </InputGroup.Root>
</div>
