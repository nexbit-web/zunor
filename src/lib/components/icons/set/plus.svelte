<script lang="ts">
  // Hugeicons PlusSign. Згенеровано scripts/icons/build-icons.mjs — не правити.
  import StrokeIcon, { type IconProps } from '../stroke-icon.svelte'

  let { size = 24, ...rest }: IconProps = $props()
</script>

<StrokeIcon {size} {...rest}>
  <path d="M12 4V20M20 12H4" />
</StrokeIcon>
