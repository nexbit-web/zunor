<script lang="ts">
  import { PinInput as InputOTPPrimitive } from 'bits-ui'
  import { cn } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    cell,
    class: className,
    ...restProps
  }: InputOTPPrimitive.CellProps = $props()
</script>

<InputOTPPrimitive.Cell
  {cell}
  bind:ref
  data-slot="input-otp-slot"
  class={cn(
    'size-9 border-y border-r border-input text-sm shadow-xs transition-all outline-none first:rounded-l-[10px] first:border-l last:rounded-r-[10px] aria-invalid:border-destructive data-[active=true]:border-ring data-[active=true]:shadow-[0_0_0_1px_var(--color-ring)] data-[active=true]:aria-invalid:border-destructive bg-field relative flex items-center justify-center data-[active=true]:z-10',
    className,
  )}
  {...restProps}
>
  {cell.char}
  {#if cell.hasFakeCaret}
    <div
      class="cn-input-otp-caret pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <div
        class="h-4 w-px animate-caret-blink bg-foreground duration-1000 h-4 w-px bg-foreground"
      ></div>
    </div>
  {/if}
</InputOTPPrimitive.Cell>
