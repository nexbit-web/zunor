<script lang="ts">
  import { cn, type WithElementRef } from '$lib/utils.js'
  import type { HTMLAttributes } from 'svelte/elements'

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props()
</script>

<div
  bind:this={ref}
  data-slot="alert-dialog-footer"
  class={cn(
    'cn-alert-dialog-footer flex flex-row items-center justify-end gap-2 ',
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</div>
