// Іконки з продуктовими іменами. Сам набір — set/*.svelte (стиль
// Hugeicons Stroke Rounded, генерує scripts/icons/build-icons.mjs); тут
// лише кажемо, яка з них «Заявки», а яка «Замовлення». Загальні іконки
// (стрілки, хрестик, галочка) імпортуй прямо з set/ — як колись із lucide.
export { default as JobsIcon } from './set/files.svelte'
export { default as OrdersIcon } from './set/clipboard-check.svelte'
export { default as MessagesIcon } from './messages-icon.svelte'
export { default as NotificationsIcon } from './set/bell.svelte'
export { default as AnalyticsIcon } from './set/analytics.svelte'
export { default as SettingsIcon } from './set/settings.svelte'
// «Нове замовлення» — просто плюс, без кола.
export { default as NewJobIcon } from './set/plus.svelte'
export { default as CameraAddIcon } from './set/camera-add.svelte'
export { default as BellOffIcon } from './bell-off-icon.svelte'
export { default as WaveIcon } from './set/waving-hand.svelte'
export { default as ZunorMark } from './zunor-mark.svelte'
export {
  default as ZunorMarkAnimated,
  type MarkAnimationName,
} from './zunor-mark-animated.svelte'
export { default as ZunorPasswordPeek } from './zunor-password-peek.svelte'
