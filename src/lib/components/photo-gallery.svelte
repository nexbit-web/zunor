<script lang="ts">
  // Сітка фото з повноекранним переглядом (портфоліо в профілі, фото
  // заявки). Перегляд — спільний $lib/utils/photo-lightbox: справжні
  // розміри знімка замість вигаданих 1600×1600, через які PhotoSwipe
  // розтягував кожне фото в квадрат.
  import { photoLightbox } from '$lib/utils/photo-lightbox'

  interface Props {
    images: string[]
    /** CSS-клас для сітки (колонки тощо). */
    gridClass?: string
  }

  let { images, gridClass = 'grid grid-cols-3 gap-2' }: Props = $props()

  let gallery = $state<HTMLElement | null>(null)

  $effect(() => {
    if (gallery) return photoLightbox(gallery)
  })
</script>

{#if images.length > 0}
  <div bind:this={gallery} class={gridClass}>
    {#each images as src, i (src)}
      <a
        href={src}
        data-pswp
        data-cropped
        target="_blank"
        rel="noopener noreferrer"
        class="block aspect-square cursor-zoom-in overflow-hidden rounded-xl border border-border transition-opacity hover:opacity-90"
      >
        <img
          {src}
          alt="Фото {i + 1}"
          loading="lazy"
          class="h-full w-full object-cover"
        />
      </a>
    {/each}
  </div>
{/if}
