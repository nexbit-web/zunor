import type { AnimationItem, AnimationSegment } from 'lottie-web'
import type { Attachment } from 'svelte/attachments'

/**
 * Lottie-анімація в елементі:
 *
 * ```svelte
 * <div {@attach lottie({ src: '/animations/photo-upload.json' })}></div>
 * ```
 *
 * Бібліотека вантажиться ЛІНИВО — окремим чанком і лише там, де анімація
 * справді є; JSON береться зі `static/` за URL, тож бандл не роздуває.
 *
 * Збірка `lottie_light`: тільки SVG-рендерер, без expressions і ефектів.
 * Нашим анімаціям більшого не треба, а це на ~40 КБ (gzip) менше за повну.
 * Нова анімація з expressions у цій збірці мовчки стоятиме — перевір
 * експорт перед тим, як класти файл у `static/animations`.
 */

export interface LottieOptions {
  src: string
  loop?: boolean
  /**
   * Маркер із JSON, що крутиться по колу; усе до нього — вступ, який
   * грає один раз. Без маркера по колу йде вся анімація.
   */
  loopMarker?: string
  /**
   * false — стоїть на першому кадрі: для prefers-reduced-motion або коли
   * кадрами керує сам компонент (через onready).
   */
  autoplay?: boolean
  /** Перший кадр намальовано: можна прибирати заглушку або брати кермо. */
  onready?: (anim: AnimationItem, markers: LottieMarker[]) => void
}

/** Маркер у JSON: назва, перший кадр, тривалість у кадрах. */
export interface LottieMarker {
  cm: string
  tm: number
  dr: number
}

export function lottie({
  src,
  loop = true,
  loopMarker,
  autoplay = true,
  onready,
}: LottieOptions): Attachment<HTMLElement> {
  return (node) => {
    let anim: AnimationItem | undefined
    let destroyed = false

    // Бібліотеку й JSON тягнемо паралельно: з `path` lottie почав би
    // вантажити файл лише після себе.
    Promise.all([
      import('lottie-web/build/player/lottie_light'),
      fetch(src).then((r) => r.json() as Promise<{ markers?: LottieMarker[] }>),
    ])
      .then(([{ default: player }, data]) => {
        if (destroyed) return
        const markers = data.markers ?? []
        const segments = loopSegments(markers, loopMarker)
        const item = player.loadAnimation({
          container: node,
          renderer: 'svg',
          loop,
          autoplay: false,
          animationData: data,
        })
        item.addEventListener('DOMLoaded', () => {
          onready?.(item, markers)
          if (!autoplay) return
          if (segments) item.playSegments(segments, true)
          else item.play()
        })
        anim = item
      })
      // Анімація — прикраса: не завантажилась, то й не показуємо.
      .catch(() => {})

    return () => {
      destroyed = true
      anim?.destroy()
    }
  }
}

function loopSegments(
  markers: LottieMarker[],
  name: string | undefined,
): AnimationSegment[] | null {
  const marker = name ? markers.find((m) => m.cm === name) : undefined
  if (!marker) return null
  const cycle: AnimationSegment = [marker.tm, marker.tm + marker.dr]
  return marker.tm > 0 ? [[0, marker.tm], cycle] : [cycle]
}
