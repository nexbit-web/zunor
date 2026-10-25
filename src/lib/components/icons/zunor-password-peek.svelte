<!-- Знак Zunor, що стежить за полем пароля
     (static/animations/zunor-password-peek.json):

       поле порожнє             → дивиться            маркер idle
       є пароль                 → закрив очі руками   маркер hidden
       є пароль, його показано  → підглядає           маркер visible

     Фокус не важить: очі закриті, доки в полі є хоч один символ.

     Кадрами керуємо самі, а не play()/playSegments(): ціль може змінитись
     посеред переходу (ввів → «показати» → стер), і лише крок від
     ПОТОЧНОГО кадру до нової цілі ніколи не стрибає.

     Голова тут намальована інакше, ніж ZunorMark, тож статичної заглушки
     немає: місце тримає aspect-ratio, а знак проявляється, щойно готовий. -->
<script lang="ts">
  import type { AnimationItem } from 'lottie-web'
  import { prefersReducedMotion } from 'svelte/motion'
  import { cn } from '$lib/utils.js'
  import { lottie, type LottieMarker } from '$lib/utils/lottie'

  interface Props {
    /** У полі вже щось введено. */
    filled: boolean
    /** Пароль показано текстом. */
    visible: boolean
    class?: string
  }

  let { filled, visible, class: className = '' }: Props = $props()

  let anim = $state.raw<AnimationItem>()
  let frames = $state.raw<Record<string, number>>({})

  const target = $derived(
    frames[!filled ? 'idle' : visible ? 'visible' : 'hidden'] ?? 0,
  )

  // Кадр на екрані. Не $state: його крутить rAF, а не розмітка.
  let shown = 0

  function ready(item: AnimationItem, markers: LottieMarker[]): void {
    frames = Object.fromEntries(markers.map((m) => [m.cm, m.tm]))
    anim = item
  }

  $effect(() => {
    const item = anim
    const to = target
    if (!item) return

    if (prefersReducedMotion.current || shown === to) {
      shown = to
      item.goToAndStop(to, true)
      return
    }

    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const delta = ((now - last) / 1000) * item.frameRate
      last = now
      shown =
        Math.abs(to - shown) <= delta
          ? to
          : shown + Math.sign(to - shown) * delta
      item.goToAndStop(shown, true)
      if (shown !== to) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)

    // Нова ціль скасовує цей прохід; наступний продовжить із shown.
    return () => cancelAnimationFrame(raf)
  })
</script>

<div
  class={cn(
    'lottie-mono aspect-780/870 opacity-0 transition-opacity duration-300 motion-reduce:transition-none',
    anim && 'opacity-100',
    className,
  )}
  aria-hidden="true"
  {@attach lottie({
    src: '/animations/zunor-password-peek.json',
    autoplay: false,
    onready: ready,
  })}
></div>
