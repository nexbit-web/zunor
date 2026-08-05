<script lang="ts">
  import { goto } from '$app/navigation'
  import ClientOnboarding from '$lib/components/onboarding/client-onboarding.svelte'
  import MasterOnboarding from '$lib/components/onboarding/master-onboarding.svelte'
  import { SettingsGroup, SettingsRow } from '$lib/components/settings'
  import { Button } from '$lib/components/ui/button'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  const isMaster = $derived(data.user.role === 'MASTER')
</script>

{#if isMaster}
  <MasterOnboarding {data} mode="edit" onBack={() => goto('/dashboard')} />
{:else}
  <ClientOnboarding {data} mode="edit" onBack={() => goto('/dashboard')} />

  <!-- Перехід у виконавці — окрема усвідомлена дія, а не побічний ефект
       відкриття форми. Назад дороги немає, тому попереджаємо явно.
       SettingsGroup тепер малює ту саму картку, що й форма вище, тож
       власна розмітка тут більше не потрібна. -->
  <div class="mx-auto w-full max-w-2xl px-4 pb-8">
    <SettingsGroup title="Роль">
      <SettingsRow
        label="Стати виконавцем"
        description="Заповніть профіль виконавця — і почнете отримувати заявки. Повернутися до ролі замовника буде неможливо."
      >
        {#snippet control()}
          <Button
            variant="outline"
            onclick={() => goto('/dashboard/onboarding/master')}
            class="bg-background"
          >
            Почати
          </Button>
        {/snippet}
      </SettingsRow>
    </SettingsGroup>
  </div>
{/if}
