<script lang="ts">
  import ZunorMark from '$lib/components/icons/zunor-mark.svelte'

  interface Props {
    linked?: boolean
  }

  let { linked = true }: Props = $props()
</script>

<!-- Знак і напис — два окремі елементи. Раніше це був один SVG, де старий
     знак і літери були злиті в спільний контур, і замінити знак не
     перемальовуючи напис було неможливо. Літери лишились ті самі. -->
{#snippet wordmark()}
  <ZunorMark class="h-[21px] w-auto shrink-0" />
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="356 26 878 245"
    class="h-[16px] w-auto shrink-0"
    aria-hidden="true"
    ><path
      fill="currentColor"
      d="M358 265v-30.5.1-.1L478.3 71.6h-117V28.7h177.2V59L419 222.1h121.4V265zm261.7 3.3a58 58 0 0 1-44.2-16.8 64 64 0 0 1-16-45.9V91.3h43.3v102q0 17.6 8 27.1T635 230q17.5 0 28-12 10.3-12 10.3-30.2V91.3h43.6V265h-42.3v-47.5l21.8 22h-21.8a59 59 0 0 1-22.3 21.4q-13.6 7.4-32.6 7.4m129.1-3.3V91.3h42.5v32l-5.2-6.5h5q8-13 22.7-21a69 69 0 0 1 33-7.8q28.6 0 44.7 17.3t16.2 47.7v112h-43.4V163q0-16.3-8.1-26.4-8-10.2-25.3-10.2-16.1 0-27.3 11.2a40 40 0 0 0-11.3 29.6V265zm268.2 3.3a88 88 0 0 1-65-26.2 88 88 0 0 1-26.2-64 87 87 0 0 1 26.1-63.7 88 88 0 0 1 65-26.4 88 88 0 0 1 65 26.4 87 87 0 0 1 26.3 63.6q0 37.7-26.3 64a88 88 0 0 1-65 26.3m0-40.4q20 0 34.7-14.2a48 48 0 0 0 14.7-35.7q0-21.2-14.7-35.4a48 48 0 0 0-34.8-14.2q-20.1 0-34.6 14.2a48 48 0 0 0-14.5 35.4q0 21.3 14.5 35.7a48 48 0 0 0 34.6 14.2m112.4 37.1V91.3h40.3v30.3l-2.8-3.3h2.8a62 62 0 0 1 20.8-23 47 47 0 0 1 37.6-5.7l2.8.7v39.6l-2.8-.7a56 56 0 0 0-7.1-1.1q-4.3-.7-7.6-.7-16.4 0-28.4 12t-12 33.7V265z"
    /></svg
  >
{/snippet}

{#if linked}
  <a
    href="/"
    class="inline-flex items-center gap-2 text-foreground select-none"
    aria-label="Zunor — головна"
  >
    {@render wordmark()}
  </a>
{:else}
  <span class="inline-flex items-center gap-2 text-foreground select-none">
    {@render wordmark()}
  </span>
{/if}
