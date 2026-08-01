<script lang="ts">
  // Роутер онбордингу: вибір ролі → рендерить потрібний компонент.
  // Логіка збереження всередині кожного компонента (клієнт → action save,
  // майстер → /api/user/onboarding). Тут лише вибір.
  import { UserRound, Hammer } from 'lucide-svelte'
  import ClientOnboarding from '$lib/components/onboarding/client-onboarding.svelte'
  import MasterOnboarding from '$lib/components/onboarding/master-onboarding.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  type Role = 'CLIENT' | 'MASTER'
  let role = $state<Role | null>(null)
</script>

<svelte:head><title>Ласкаво просимо · Zunor</title></svelte:head>

{#if !role}
  <div
    class="mx-auto flex min-h-[80vh] w-full max-w-lg flex-col justify-center px-4 py-10"
  >
    <div class="mb-8 flex flex-col items-center gap-1 text-center">
      <h1 class="text-2xl font-bold tracking-[-0.01em]">Хто ви на Zunor?</h1>
      <p class="text-sm text-balance text-muted-foreground">
        Оберіть роль — далі заповните профіль
      </p>
    </div>

    <div class="flex flex-col gap-3">
      <button
        type="button"
        onclick={() => (role = 'CLIENT')}
        class="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left transition-all hover:border-primary/50 hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span
          class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <UserRound size={24} strokeWidth={1.9} aria-hidden="true" />
        </span>
        <span class="min-w-0">
          <span class="block text-base font-semibold">Замовник</span>
          <span class="block text-sm text-muted-foreground">
            Замовляю прибирання, обираю майстра
          </span>
        </span>
      </button>

      <button
        type="button"
        onclick={() => (role = 'MASTER')}
        class="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left transition-all hover:border-primary/50 hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span
          class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <Hammer size={24} strokeWidth={1.9} aria-hidden="true" />
        </span>
        <span class="min-w-0">
          <span class="block text-base font-semibold">Виконавець</span>
          <span class="block text-sm text-muted-foreground">
            Виконую замовлення, отримую оплату
          </span>
        </span>
      </button>
    </div>
  </div>
{:else if role === 'CLIENT'}
  <ClientOnboarding {data} onBack={() => (role = null)} />
{:else}
  <MasterOnboarding {data} onBack={() => (role = null)} />
{/if}
