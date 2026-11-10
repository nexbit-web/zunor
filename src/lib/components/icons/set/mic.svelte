<script lang="ts">
  // Hugeicons Mic01. Згенеровано scripts/icons/build-icons.mjs — не правити.
  import StrokeIcon, { type IconProps } from '../stroke-icon.svelte'

  let { size = 24, ...rest }: IconProps = $props()
</script>

<StrokeIcon {size} {...rest}>
  <path
    d="M7 6.5C7 4.01472 9.01472 2 11.5 2C13.9853 2 16 4.01472 16 6.5V11.5C16 13.9853 13.9853 16 11.5 16C9.01472 16 7 13.9853 7 11.5V6.5Z"
  />
  <path
    d="M11.5 19H11.0828C7.57267 19 4.57706 16.4623 4 13M11.5 19H11.9172C15.4273 19 18.4229 16.4623 19 13M11.5 19V22"
  />
</StrokeIcon>
