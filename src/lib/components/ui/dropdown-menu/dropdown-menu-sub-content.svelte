<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui'
  import { cn } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: DropdownMenuPrimitive.SubContentProps = $props()
</script>

<DropdownMenuPrimitive.SubContent
  bind:ref
  data-slot="dropdown-menu-sub-content"
  class={cn(
    'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-input bg-popover text-popover-foreground min-w-[96px] rounded-xl p-1.5 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.14),0_2px_6px_rgb(0_0_0/0.05)] dark:shadow-[0_12px_32px_-8px_rgb(0_0_0/0.6)] ring-1 duration-100 w-auto',
    className,
  )}
  {...restProps}
/>
