<script lang="ts">
  import { cn, type WithElementRef, type WithoutChildren } from '$lib/utils.js'
  import type { HTMLTextareaAttributes } from 'svelte/elements'

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    'data-slot': dataSlot = 'textarea',
    ...restProps
  }: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props()
</script>

<textarea
  bind:this={ref}
  data-slot={dataSlot}
  class={cn(
    'border-input focus-visible:border-ring focus-visible:shadow-[0_0_0_1px_var(--color-ring)] aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:shadow-[0_0_0_1px_var(--color-destructive)] aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-[10px] border bg-field px-2.5 py-2 text-base shadow-xs transition-[color,box-shadow] md:text-sm placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full outline-none disabled:cursor-not-allowed disabled:opacity-50',
    className,
  )}
  bind:value
  {...restProps}
></textarea>
