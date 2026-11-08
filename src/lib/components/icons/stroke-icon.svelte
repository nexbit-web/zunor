<script lang="ts" module>
  import type { ClassValue, SVGAttributes } from 'svelte/elements'

  /**
   * Пропи будь-якої іконки набору — ті самі, що були в lucide: розмір,
   * товщина лінії, клас і будь-які атрибути svg (aria-*, fill, style).
   */
  export interface IconProps
    extends Omit<SVGAttributes<SVGSVGElement>, 'class'> {
    size?: number | string
    strokeWidth?: number | string
    class?: ClassValue
  }
</script>

<script lang="ts">
  // Основа всіх наших іконок. Стиль один на весь застосунок — Hugeicons
  // Stroke Rounded (MIT): сітка 24×24, лінія 1.5, мʼякі кути-«суперeліпси»,
  // круглі кінці й зʼєднання. Іконка кладе сюди лише свої контури, а
  // атрибути лінії живуть тут, щоб набір не розійшовся.
  //
  // Самі іконки — set/*.svelte, їх генерує scripts/icons/build-icons.mjs
  // (там же — як додати нову). Іконок lucide у проєкті більше немає: нова
  // іконка — рядок у генераторі, а не імпорт із lucide.
  //
  // Анімацій у іконок немає навмисно — вони статичні, як у референсі.

  import type { Snippet } from 'svelte'

  let {
    size = 18,
    strokeWidth = 1.5,
    class: className,
    children,
    ...rest
  }: IconProps & { children: Snippet } = $props()
</script>

<!-- Як і lucide, svg лишається inline і власних класів не має: іконки
     стоять посеред тексту, і примусовий display ламав би такі місця.
     rest — після типових атрибутів, щоб fill="currentColor" чи
     aria-label з місця виклику їх перекривали. -->
<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
  {...rest}
  class={className}
>
  {@render children()}
</svg>
