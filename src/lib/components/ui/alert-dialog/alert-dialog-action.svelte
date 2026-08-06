<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from 'bits-ui'
  import { cn } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    class: className,
    variant = 'default',
    ...restProps
  }: AlertDialogPrimitive.ActionProps & {
    variant?: 'default' | 'destructive' | 'destructive-filled'
  } = $props()

  const variants = {
    default: 'text-primary hover:bg-primary/10 active:bg-primary/15',
    destructive:
      'text-destructive hover:bg-destructive/10 active:bg-destructive/15',
    'destructive-filled':
      'bg-destructive text-white hover:brightness-110 active:brightness-95 px-5',
  }
</script>

<AlertDialogPrimitive.Action
  bind:ref
  data-slot="alert-dialog-action"
  class={cn(
    'cn-alert-dialog-action inline-flex h-10 items-center justify-center rounded-[16px] px-3 text-[15px] font-medium uppercase tracking-[0.02em] transition disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    className,
  )}
  {...restProps}
/>
