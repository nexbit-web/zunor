<script lang="ts">
  import AuthShell from '$lib/components/auth/auth-shell.svelte'
  import LoginForm from '$lib/components/login-form.svelte'
</script>

<svelte:head>
  <title>Вхід — Zunor</title>
</svelte:head>

<!-- Одна колонка по центру, як у ClickUp: знак, заголовок із посиланням
     на реєстрацію, під ним форма. Тексти — дослівно з української версії
     ClickUp. Картинки збоку немає — вона не пояснювала форму й на
     телефоні не показувалась узагалі. -->
<AuthShell title="Ласкаво просимо назад!" mark="password">
  {#snippet subtitle()}
    Немає облікового запису?
    <a
      href="/user/register"
      class="text-primary underline-offset-4 transition-colors hover:text-primary-hover hover:underline"
    >
      Зареєструватися
    </a>
  {/snippet}

  <LoginForm />
</AuthShell>
