<!-- Знак Zunor з Lottie-анімацією. Файли — у static/animations, де на їхньому
     полотні стоїть знак — у ANIMATIONS нижче.

     Клас задає розмір САМОГО знака, як у ZunorMark. Полотно анімації може
     бути більшим (знаки питання над головою) і виходить за ці межі, не
     зсуваючи сусідів.

     Доки lottie вантажиться (і на сервері) — статичний ZunorMark того ж
     розміру, тож шапка не стрибає. При prefers-reduced-motion анімацію не
     вантажимо зовсім. Колір із JSON ігнорується — контур бере currentColor. -->
<script lang="ts" module>
  /** Полотно анімації і місце на ньому знака 393×411, у пікселях полотна. */
  interface MarkAnimation {
    src: string
    width: number
    height: number
    x: number
    y: number
    loopMarker?: string
  }

  export type MarkAnimationName = 'blink' | 'puzzled'

  const MARK = { width: 393, height: 411 }

  const ANIMATIONS: Record<MarkAnimationName, MarkAnimation> = {
    blink: {
      src: '/animations/zunor-mark-blink.json',
      width: 393,
      height: 411,
      x: 0,
      y: 0,
    },
    puzzled: {
      src: '/animations/zunor-mark-puzzled.json',
      width: 480,
      height: 640,
      x: 43,
      y: 219,
      loopMarker: 'loop',
    },
  }

  const percent = (part: number, whole: number) => `${(part / whole) * 100}%`
</script>

<script lang="ts">
  import { prefersReducedMotion } from 'svelte/motion'
  import { cn } from '$lib/utils.js'
  import { lottie } from '$lib/utils/lottie'
  import ZunorMark from './zunor-mark.svelte'

  let {
    animation,
    class: className = '',
  }: { animation: MarkAnimationName; class?: string } = $props()

  const a = $derived(ANIMATIONS[animation])

  let ready = $state(false)
</script>

<span
  class={cn('relative inline-block aspect-393/411', className)}
  aria-hidden="true"
>
  {#if !ready || prefersReducedMotion.current}
    <ZunorMark class="block size-full" />
  {/if}
  {#if !prefersReducedMotion.current}
    <span
      class="lottie-mono pointer-events-none absolute"
      style:left={percent(-a.x, MARK.width)}
      style:top={percent(-a.y, MARK.height)}
      style:width={percent(a.width, MARK.width)}
      style:height={percent(a.height, MARK.height)}
      {@attach lottie({
        src: a.src,
        loopMarker: a.loopMarker,
        onready: () => (ready = true),
      })}
    ></span>
  {/if}
</span>
