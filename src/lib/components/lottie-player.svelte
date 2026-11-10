<!--
  Lottie-плеєр. Ліниве завантаження — у $lib/utils/lottie.
  Поважає prefers-reduced-motion: анімація стоїть на першому кадрі.
-->
<script lang="ts">
  import { prefersReducedMotion } from 'svelte/motion'
  import { cn } from '$lib/utils.js'
  import { lottie } from '$lib/utils/lottie'

  let {
    src,
    size,
    loop = true,
    monochrome = false,
    class: className = '',
  }: {
    /** URL JSON-файлу анімації, напр. '/animations/photo-upload.json' */
    src: string
    /** Ширина/висота у px. Без нього розмір задає клас. */
    size?: number
    loop?: boolean
    /** Одним кольором — кольором тексту, а не кольорами з JSON. */
    monochrome?: boolean
    class?: string
  } = $props()
</script>

<div
  class={cn(monochrome && 'lottie-mono', className)}
  style:width={size && `${size}px`}
  style:height={size && `${size}px`}
  {@attach lottie({ src, loop, autoplay: !prefersReducedMotion.current })}
  aria-hidden="true"
></div>
