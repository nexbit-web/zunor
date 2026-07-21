<!-- src/lib/components/lottie-player.svelte -->
<!--
  Легкий Lottie-плеєр: lottie-web вантажиться ЛІНИВО (динамічний import),
  JSON анімації тягнеться з static/ за URL (не роздуває бандл).
  Поважає prefers-reduced-motion: анімація стоїть на першому кадрі.
-->
<script lang="ts">
  import type { AnimationItem } from 'lottie-web'
  import type { Attachment } from 'svelte/attachments'

  let {
    src,
    size = 140,
    loop = true,
  }: {
    /** URL JSON-файлу анімації, напр. '/animations/photo-upload.json' */
    src: string
    /** Ширина/висота у px */
    size?: number
    loop?: boolean
  } = $props()

  const lottie: Attachment<HTMLElement> = (node) => {
    let anim: AnimationItem | undefined
    let destroyed = false

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    ;(async () => {
      try {
        const mod = await import('lottie-web')
        if (destroyed) return
        anim = mod.default.loadAnimation({
          container: node,
          renderer: 'svg',
          loop,
          autoplay: !reduced,
          path: src,
        })
        if (reduced) anim.goToAndStop(0, true)
      } catch {
        // Анімація — прикраса: якщо не завантажилась, просто нічого не показуємо
      }
    })()

    return () => {
      destroyed = true
      anim?.destroy()
    }
  }
</script>

<div
  style:width="{size}px"
  style:height="{size}px"
  {@attach lottie}
  aria-hidden="true"
></div>
