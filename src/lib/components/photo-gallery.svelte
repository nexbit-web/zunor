<!-- src/lib/components/photo-gallery.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import PhotoSwipeLightbox from 'photoswipe/lightbox'
  import 'photoswipe/style.css'

  interface Props {
    images: string[]
    /** CSS-клас для сітки (колонки тощо). */
    gridClass?: string
  }

  let { images, gridClass = 'grid grid-cols-3 gap-2' }: Props = $props()

  // Унікальний id галереї (щоб кілька галерей на сторінці не конфліктували)
  const galleryId = `pswp-${Math.random().toString(36).slice(2, 9)}`

  let lightbox: PhotoSwipeLightbox | null = null

  onMount(() => {
    lightbox = new PhotoSwipeLightbox({
      gallery: `#${galleryId}`,
      children: 'a',
      pswpModule: () => import('photoswipe'),
    })
    lightbox.init()
  })

  onDestroy(() => {
    lightbox?.destroy()
    lightbox = null
  })
</script>

{#if images.length > 0}
  <div id={galleryId} class={gridClass}>
    {#each images as src, i (src)}
      <a
        href={src}
        data-pswp-width="1600"
        data-pswp-height="1600"
        target="_blank"
        rel="noopener noreferrer"
        class="block aspect-square rounded-xl overflow-hidden border border-border hover:opacity-90 transition-opacity"
      >
        <img
          {src}
          alt="Фото {i + 1}"
          loading="lazy"
          class="w-full h-full object-cover"
        />
      </a>
    {/each}
  </div>
{/if}
