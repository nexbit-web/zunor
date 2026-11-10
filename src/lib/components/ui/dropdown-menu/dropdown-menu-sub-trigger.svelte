<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui'
  import ChevronRightIcon from '$lib/components/icons/set/chevron-right.svelte'
  import { cn } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    class: className,
    inset,
    children,
    ...restProps
  }: DropdownMenuPrimitive.SubTriggerProps & {
    inset?: boolean
  } = $props()
</script>

<DropdownMenuPrimitive.SubTrigger
  bind:ref
  data-slot="dropdown-menu-sub-trigger"
  data-inset={inset}
  class={cn(
    "focus:bg-accent focus:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground gap-3 rounded-lg px-3 py-2 text-[15px] data-inset:pl-9 [&_svg:not([class*='size-'])]:size-4 flex cursor-default items-center outline-hidden select-none data-[inset]:pl-9 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
  <ChevronRightIcon class="ml-auto" />
</DropdownMenuPrimitive.SubTrigger>
