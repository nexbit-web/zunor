<script lang="ts">
  // Обгортка для тостів: іконка з увімкненою анімацією.
  // Окремий файл замість рантайм-обгортки — svelte-hot-french-toast
  // приймає компонент і монтує його штатно, без ручного виклику
  // внутрішнього API Svelte.
  import { NotificationsIcon } from './index'
</script>

<NotificationsIcon size={18} animate />
