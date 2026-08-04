<script lang="ts">
  import { goto } from '$app/navigation'
  import ClientOnboarding from '$lib/components/onboarding/client-onboarding.svelte'
  import MasterOnboarding from '$lib/components/onboarding/master-onboarding.svelte'
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
       Розмітка та сама, що й у картках форми вище, — SettingsGroup
       із рамкою тут виглядав би чужорідно. -->
  <div class="mx-auto w-full max-w-2xl px-4 pb-8">
    <h2 class="mt-2 mb-2 px-1 text-sm font-semibold">Роль</h2>

    <div class="rounded-xl bg-muted/40 py-1">
      <div
        class="mx-4 flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
      >
        <div class="min-w-0">
          <p class="text-sm">Стати виконавцем</p>
          <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            Заповніть профіль виконавця — і почнете отримувати заявки.
            Повернутися до ролі замовника буде неможливо.
          </p>
        </div>

        <Button
          variant="outline"
          onclick={() => goto('/dashboard/onboarding/master')}
          class="shrink-0 bg-background"
        >
          Почати
        </Button>
      </div>
    </div>
  </div>
{/if}
