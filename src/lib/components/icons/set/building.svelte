<script lang="ts">
  // Hugeicons Building02. Згенеровано scripts/icons/build-icons.mjs — не правити.
  import StrokeIcon, { type IconProps } from '../stroke-icon.svelte'

  let { size = 24, ...rest }: IconProps = $props()
</script>

<StrokeIcon {size} {...rest}>
  <path
    d="M15 2H9C5.69067 2 5 2.69067 5 6V22H19V6C19 2.69067 18.3093 2 15 2Z"
  />
  <path d="M3 22H21" />
  <path
    d="M15 22V19C15 17.3453 14.6547 17 13 17H11C9.34533 17 9 17.3453 9 19V22"
  />
  <path d="M13.5 6H10.5M13.5 9.5H10.5M13.5 13H10.5" />
</StrokeIcon>
