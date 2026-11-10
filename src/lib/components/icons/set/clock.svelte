<script lang="ts">
  // Hugeicons Clock01. Згенеровано scripts/icons/build-icons.mjs — не правити.
  import StrokeIcon, { type IconProps } from '../stroke-icon.svelte'

  let { size = 24, ...rest }: IconProps = $props()
</script>

<StrokeIcon {size} {...rest}>
  <circle cx="12" cy="12" r="10" />
  <path d="M12 8V12L14 14" />
</StrokeIcon>
