<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from 'bits-ui'
  import {
    buttonVariants,
    type ButtonVariant,
    type ButtonSize,
  } from '$lib/components/ui/button/index.js'
  import { cn } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    class: className,
    variant = 'outline',
    size = 'default',
    ...restProps
  }: AlertDialogPrimitive.CancelProps & {
    variant?: ButtonVariant
    size?: ButtonSize
  } = $props()
</script>

<AlertDialogPrimitive.Cancel
  bind:ref
  data-slot="alert-dialog-cancel"
  class={cn(
    'cn-alert-dialog-cancel inline-flex h-10 items-center justify-center rounded-[16px] px-3 text-[15px] font-medium uppercase tracking-[0.02em] text-primary transition hover:bg-primary/10 active:bg-primary/15 disabled:pointer-events-none disabled:opacity-50',
    className,
  )}
  {...restProps}
/>
