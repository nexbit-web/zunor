<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    label: string
    description?: string
    /** id контрола — щоб клік по підпису фокусував саме його. */
    for?: string
    /** Контрол праворуч: перемикач, селект, кнопка. */
    control?: Snippet
  }

  let { label, description, for: htmlFor, control }: Props = $props()
</script>

<div class="flex items-center justify-between gap-6 px-4 py-3.5">
  <div class="min-w-0">
    {#if htmlFor}
      <label for={htmlFor} class="cursor-pointer text-sm font-medium">
        {label}
      </label>
    {:else}
      <p class="text-sm font-medium">{label}</p>
    {/if}

    {#if description}
      <p class="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        {description}
      </p>
    {/if}
  </div>

  {#if control}
    <div class="shrink-0">{@render control()}</div>
  {/if}
</div>
