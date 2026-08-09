<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from 'bits-ui'
  import { cn } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: AlertDialogPrimitive.DescriptionProps = $props()
</script>

<AlertDialogPrimitive.Description
  bind:ref
  data-slot="alert-dialog-description"
  class={cn(
    'text-foreground text-[17px] font-normal leading-[1.3125] whitespace-pre-wrap break-words px-4 pt-2.5 pb-2 -mx-4',
    className,
  )}
  {...restProps}
/>
