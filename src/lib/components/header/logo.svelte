<script lang="ts">
  interface Props {
    linked?: boolean
  }

  let { linked = true }: Props = $props()
</script>

{#if linked}
  <a
    href="/"
    class="text-white font-bold text-xl leading-none tracking-tighter select-none"
    aria-label="Zunor — головна"
  >
    Zunor
  </a>
{:else}
  <span class="text-white font-bold text-xl leading-none tracking-tighter select-none">
    Zunor
  </span>
{/if}