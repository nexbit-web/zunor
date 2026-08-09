<script lang="ts">
  import { SettingsGroup, SettingsRow } from '$lib/components/settings'
  import { Switch } from '$lib/components/ui/switch/index.js'
  import { notificationSound } from '$lib/notifications'
  import { BellOnIcon, BellOffIcon } from '$lib/components/icons'
  import toast from 'svelte-hot-french-toast'

  // Тримаємо id останнього тоста, щоб закрити його перед показом нового.
  // Спільний id у toast() тут не годиться: бібліотека оновлює вміст,
  // але таймер автозакриття не перезапускає — тост зависає назавжди.
  let lastToastId: string | undefined

  function handleToggle(): void {
    notificationSound.toggle()

    if (lastToastId) toast.dismiss(lastToastId)

    // Тост — єдине підтвердження при ВИМИКАННІ: увімкнення чути,
    // а вимкнення інакше лишається без жодного зворотного зв'язку.
    lastToastId = notificationSound.enabled
      ? toast('Звук сповіщень увімкнено', {
          icon: BellOnIcon,
          duration: 2000,
        })
      : toast('Звук сповіщень вимкнено', {
          icon: BellOffIcon,
          duration: 2000,
        })
  }
</script>

<SettingsGroup
  title="Звук"
  footnote="Налаштування зберігається в цьому браузері."
>
  <SettingsRow
    label="Звук сповіщень"
    description="Короткий сигнал, коли приходить новий відгук або замовлення."
    for="notif-sound"
  >
    {#snippet control()}
      <!-- checked + onCheckedChange, а не bind:checked: enabled не
           $bindable, а toggle() ще й пише в localStorage. -->
      <Switch
        id="notif-sound"
        checked={notificationSound.enabled}
        onCheckedChange={handleToggle}
      />
    {/snippet}
  </SettingsRow>
</SettingsGroup>
