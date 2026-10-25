<!-- Знак Zunor з Lottie-анімацією. Файли — у static/animations, де на їхньому
     полотні стоїть знак — у ANIMATIONS нижче.

     Клас задає розмір САМОГО знака, як у ZunorMark. Полотно анімації може
     бути більшим (знаки питання над головою) і виходить за ці межі, не
     зсуваючи сусідів.

     Доки lottie вантажиться (і на сервері) — статичний ZunorMark того ж
     розміру, тож шапка не стрибає. При prefers-reduced-motion анімацію не
     вантажимо зовсім. Колір із JSON ігнорується — контур бере currentColor. -->
<script lang="ts" module>
  import type { AnimationItem } from 'lottie-web'
  import type { LottieMarker } from '$lib/utils/lottie'

  /** Полотно анімації і місце на ньому знака 393×411, у пікселях полотна. */
  interface MarkAnimation {
    src: string
    width: number
    height: number
    x: number
    y: number
    loopMarker?: string
    /**
     * Маркери — окремі сценки, що грають у випадковому порядку. Кожна
     * сценка мусить починатись і закінчуватись однією позою, інакше на
     * стику буде ривок.
     */
    shuffle?: boolean
  }

  export type MarkAnimationName = 'blink' | 'puzzled' | 'thinking'

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
    // Генерується scripts/animations/zunor-mark-thinking.cjs. Поле зверху —
    // під стрибок, з боків — під нахил і присідання.
    thinking: {
      src: '/animations/zunor-mark-thinking.json',
      width: 461,
      height: 489,
      x: 34,
      y: 70,
      shuffle: true,
    },
  }

  /**
   * Сценки у випадковому порядку, без повтору тієї самої двічі поспіль:
   * однакова петля на кожному «Думаю…» приїдається вже на третій репліці.
   */
  function shuffleScenes(anim: AnimationItem, markers: LottieMarker[]) {
    if (!markers.length) return anim.play()
    let last = -1
    const next = () => {
      let i = Math.floor(Math.random() * markers.length)
      if (i === last) i = (i + 1) % markers.length
      last = i
      const { tm, dr } = markers[i]
      anim.playSegments([tm, tm + dr], true)
    }
    anim.addEventListener('complete', next)
    next()
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
        // Сценками керуємо самі: петля lottie крутила б одну й ту саму.
        loop: !a.shuffle,
        autoplay: !a.shuffle,
        onready: (anim, markers) => {
          ready = true
          if (a.shuffle) shuffleScenes(anim, markers)
        },
      })}
    ></span>
  {/if}
</span>
