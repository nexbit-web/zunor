<script lang="ts">
  import { cn } from '$lib/utils.js'
  import type { ComponentProps } from 'svelte'
  import { Input } from '$lib/components/ui/input/index.js'

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    ...props
  }: ComponentProps<typeof Input> = $props()
</script>

<Input
  bind:ref
  data-slot="input-group-control"
  class={cn(
    // focus-visible:shadow-none обовʼязковий: рамку на фокусі базовий
    // Input малює тінню в 1px, і border-0 її не знімає — саме вона
    // лишалась синім прямокутником навколо рядка пошуку.
    'rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:border-0 focus-visible:shadow-none focus-visible:ring-0 aria-invalid:shadow-none aria-invalid:ring-0 dark:bg-transparent flex-1',
    className,
  )}
  bind:value
  {...props}
/>
