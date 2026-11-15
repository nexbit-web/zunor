<script lang="ts">
  import { onMount } from 'svelte'
  import { invalidateAll } from '$app/navigation'
  import {
    SettingsGroup,
    SettingsRow,
    SettingsTile,
  } from '$lib/components/settings'
  import { Switch } from '$lib/components/ui/switch/index.js'
  import { Button } from '$lib/components/ui/button'
  import { notificationSound } from '$lib/notifications'
  import { NotificationsIcon, BellOffIcon } from '$lib/components/icons'
  import toast from 'svelte-hot-french-toast'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  // ─── Telegram ───
  // Підключення йде через бота: кнопка відкриває t.me/<бот>?start=<токен>,
  // людина тисне «Start», бот записує чат. Сторінка про це дізнається,
  // коли людина повертається у вкладку, — тоді дані перечитуються (і
  // посилання з токеном заодно оновлюється: воно живе 15 хв).
  let waiting = $state(false)
  let unlinking = $state(false)

  onMount(() => {
    function onVisible(): void {
      if (document.visibilityState === 'visible' && waiting) {
        void invalidateAll().then(() => {
          if (data.telegram?.linked) waiting = false
        })
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  })

  async function unlinkTelegram(): Promise<void> {
    if (unlinking) return
    unlinking = true
    try {
      const res = await fetch('/api/telegram/link', { method: 'DELETE' })
      if (!res.ok) throw new Error(String(res.status))
      await invalidateAll()
    } catch {
      // Дія без форми: без тоста збій виглядав би як «нічого не сталося».
      toast.error('Не вдалося відключити Telegram')
    } finally {
      unlinking = false
    }
  }

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
          icon: NotificationsIcon,
          duration: 2000,
        })
      : toast('Звук сповіщень вимкнено', {
          icon: BellOffIcon,
          duration: 2000,
        })
  }
</script>

{#if data.telegram}
  <SettingsGroup
    title="Telegram"
    footnote="Вимкнути можна й у самому боті — командою /stop."
  >
    {#if data.telegram.linked}
      <SettingsRow
        label="Telegram підключено"
        description="Нові заявки, відгуки й зміни замовлень приходять у чат із ботом Zunor."
      >
        {#snippet icon()}
          <SettingsTile kind="telegram" />
        {/snippet}
        {#snippet control()}
          <Button
            variant="secondary"
            onclick={unlinkTelegram}
            disabled={unlinking}
            aria-busy={unlinking}
          >
            Відключити
          </Button>
        {/snippet}
      </SettingsRow>
    {:else}
      <SettingsRow
        label="Сповіщення в Telegram"
        description={waiting
          ? 'Натисніть «Start» у Telegram і поверніться сюди.'
          : 'Нові заявки, відгуки й зміни замовлень — навіть коли сайт закрито.'}
      >
        {#snippet icon()}
          <SettingsTile kind="telegram" />
        {/snippet}
        {#snippet control()}
          {#if data.telegram?.linkUrl}
            <Button
              href={data.telegram.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              onclick={() => (waiting = true)}
            >
              Підключити
            </Button>
          {:else}
            <span class="text-[14px] text-muted-foreground">
              Тимчасово недоступно
            </span>
          {/if}
        {/snippet}
      </SettingsRow>
    {/if}
  </SettingsGroup>
{/if}

<SettingsGroup title="Звук" footnote="Діє лише в цьому браузері.">
  <SettingsRow
    label="Звук сповіщень"
    description="Сигнал про нові відгуки й замовлення."
    for="notif-sound"
  >
    {#snippet icon()}
      <SettingsTile kind="sound" />
    {/snippet}
    {#snippet control()}
      <!-- checked + onCheckedChange, а не bind:checked: enabled не
           $bindable, а toggle() ще й пише в localStorage. -->
      <Switch
        size="lg"
        id="notif-sound"
        checked={notificationSound.enabled}
        onCheckedChange={handleToggle}
      />
    {/snippet}
  </SettingsRow>
</SettingsGroup>
