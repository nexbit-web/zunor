<!-- src/lib/components/icons/brand-icon.svelte -->
<script lang="ts">
  import type { SVGAttributes } from 'svelte/elements'
  import { BRAND_ICON_PATHS, type BrandName } from './brand-icons'

  interface Props extends SVGAttributes<SVGSVGElement> {
    name: BrandName
    /** Внутренний размер в px (квадрат). Переопределяется классом size-*. */
    size?: number
  }

  let { name, size = 18, class: className, ...rest }: Props = $props()
</script>

<svg
  viewBox="0 0 24 24"
  width={size}
  height={size}
  fill="currentColor"
  class={className}
  aria-hidden="true"
  {...rest}
>
  <path d={BRAND_ICON_PATHS[name]} />
</svg>
