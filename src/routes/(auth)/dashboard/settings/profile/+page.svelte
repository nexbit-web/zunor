<script lang="ts">
  import { goto } from '$app/navigation'
  import ClientOnboarding from '$lib/components/onboarding/client-onboarding.svelte'
  import MasterOnboarding from '$lib/components/onboarding/master-onboarding.svelte'
  import { SettingsGroup, SettingsRow } from '$lib/components/settings'
  import { Button } from '$lib/components/ui/button'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  const isMaster = $derived(data.user.role === 'MASTER')

  const close = () => goto('/dashboard')
</script>

{#if isMaster}
  <MasterOnboarding {data} mode="edit" onBack={close} />
{:else}
  <ClientOnboarding {data} mode="edit" onBack={close} />

  <!-- Перехід у виконавці — окрема усвідомлена дія, а не побічний ефект
       відкриття форми. Назад дороги немає, тому попереджаємо явно.
       Лінія зверху — та сама, що між рештою розділів сторінки. -->
  <div class="mt-8 border-t border-border pt-8">
    <SettingsGroup
      title="Роль"
      footnote="Повернутися до ролі замовника буде неможливо."
    >
      <SettingsRow
        label="Стати виконавцем"
        description="Заповніть профіль виконавця — і почнете отримувати заявки."
      >
        {#snippet control()}
          <Button
            onclick={() => goto('/dashboard/onboarding/master')}
            variant="primary-outline"
          >
            Почати
          </Button>
        {/snippet}
      </SettingsRow>
    </SettingsGroup>
  </div>
{/if}
