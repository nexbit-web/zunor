<script lang="ts">
  // Hugeicons Tick02. Згенеровано scripts/icons/build-icons.mjs — не правити.
  import StrokeIcon, { type IconProps } from '../stroke-icon.svelte'

  let { size = 24, ...rest }: IconProps = $props()
</script>

<StrokeIcon {size} {...rest}>
  <path d="M5 14L8.5 17.5L19 6.5" />
</StrokeIcon>
