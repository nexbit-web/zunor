<script lang="ts">
  // Вибір ролі — у тій самій рамці, що вхід і реєстрація (AuthShell):
  // знак, заголовок, рядок пояснення, під ним дві картки й кнопка «Далі»
  // на всю ширину колонки 400px.
  //
  // Раніше кожна картка була посиланням і клік одразу кидав на наступний
  // крок — вибрати, подивитись на другий варіант і лише потім піти далі
  // було неможливо. Тепер картка лише позначає вибір, а крок робить кнопка.
  import { goto } from '$app/navigation'
  import AuthShell from '$lib/components/auth/auth-shell.svelte'
  import FieldError from '$lib/components/forms/field-error.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Spinner } from '$lib/components/ui/spinner'
  import { UserRound, BrushCleaning } from 'lucide-svelte'

  type Role = 'client' | 'master'

  const ROLES = [
    {
      value: 'client' as Role,
      icon: UserRound,
      title: 'Я замовник',
      desc: 'Хочу замовити прибирання',
    },
    {
      value: 'master' as Role,
      icon: BrushCleaning,
      title: 'Я майстер',
      desc: 'Хочу отримувати заявки та заробляти',
    },
  ]

  let role = $state<Role | ''>('')
  let going = $state(false)
  let hint = $state('')

  function next() {
    if (going) return
    // Кнопка активна завжди: заблокована вона не пояснює, чого від
    // людини чекають, а мовчки не натискається.
    if (!role) {
      hint = 'Оберіть, хто ви'
      return
    }
    going = true
    hint = ''
    void goto(`/dashboard/onboarding/${role}`)
  }

  function pick(value: Role) {
    role = value
    hint = ''
  }
</script>

<svelte:head><title>Ласкаво просимо · Zunor</title></svelte:head>

<AuthShell title="Хто ви?" as="div" mark="puzzled">
  {#snippet subtitle()}
    Від цього залежить, що ви побачите далі.
  {/snippet}

  <div class="flex flex-col gap-3" role="radiogroup" aria-label="Хто ви">
    {#each ROLES as item (item.value)}
      {@const Icon = item.icon}
      <label class="tile" class:selected={role === item.value}>
        <input
          type="radio"
          name="role"
          value={item.value}
          checked={role === item.value}
          onchange={() => pick(item.value)}
          class="sr-only"
        />

        <span class="tile-icon">
          <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>

        <span class="tile-text">
          <span class="tile-title">{item.title}</span>
          <span class="tile-desc">{item.desc}</span>
        </span>
      </label>
    {/each}

    {#if hint}
      <div class="flex justify-center">
        <FieldError text={hint} />
      </div>
    {/if}

    <Button
      variant="primary"
      size="lg"
      class="relative w-full"
      type="button"
      onclick={next}
      disabled={going}
      aria-busy={going}
    >
      {#if going}
        <Spinner class="animate-spin" aria-hidden="true" />
        <span class="sr-only">Переходимо...</span>
      {:else}
        <span>Далі</span>
      {/if}
    </Button>
  </div>
</AuthShell>

<style>
  /* Картка — тих самих пропорцій, що поля на вході: рамка кольору поля,
     заокруглення 8px, текст 14px. Між картками й кнопкою — ті самі 12px. */
  .tile {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid var(--input);
    border-radius: 8px;
    background: var(--background);
    cursor: pointer;
    transition:
      border-color 180ms ease,
      box-shadow 180ms ease,
      color 180ms ease;
  }

  .tile:hover {
    border-color: var(--input-hover);
  }

  /* Обраний варіант — одна рамка кольору primary, без другого кільця
     навколо: два обведення читаються як два різні стани. Пів пікселя
     товщини домальовує тінь того ж кольору впритул до рамки — рухати
     border-width означало б зсунути вміст картки й розмити текст. */
  .tile.selected {
    border-color: var(--primary);
    box-shadow: 0 0 0 0.5px var(--primary);
  }

  .tile.selected .tile-icon {
    color: var(--primary);
  }

  /* Обведення лишаємо тільки для клавіатури: після кліку мишею картка
     вже позначена рамкою, і системний фокус поверх неї — зайвий. */
  .tile:has(input:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  .tile-icon {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    color: var(--muted-foreground);
  }

  .tile-text {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1px;
  }

  .tile-title {
    font-size: 14px;
    font-weight: 600;
  }

  .tile-desc {
    color: var(--muted-foreground);
    font-size: 13px;
    line-height: 1.4;
  }
</style>
