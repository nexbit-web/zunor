<script lang="ts">
  // Hugeicons ArrowUp02. Згенеровано scripts/icons/build-icons.mjs — не правити.
  import StrokeIcon, { type IconProps } from '../stroke-icon.svelte'

  let { size = 24, ...rest }: IconProps = $props()
</script>

<StrokeIcon {size} {...rest}>
  <path d="M12 5.5V19" />
  <path d="M18 11C18 11 13.5811 5.00001 12 5C10.4188 4.99999 6 11 6 11" />
</StrokeIcon>
