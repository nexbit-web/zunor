<script lang="ts">
  // Hugeicons Menu01. Згенеровано scripts/icons/build-icons.mjs — не правити.
  import StrokeIcon, { type IconProps } from '../stroke-icon.svelte'

  let { size = 24, ...rest }: IconProps = $props()
</script>

<StrokeIcon {size} {...rest}>
  <path d="M4 5L20 5" />
  <path d="M4 12L20 12" />
  <path d="M4 19L20 19" />
</StrokeIcon>
