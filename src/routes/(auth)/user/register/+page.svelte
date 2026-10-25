<script lang="ts">
  import AuthShell from '$lib/components/auth/auth-shell.svelte'
  import SignupForm from '$lib/components/signup-form.svelte'
  import { COMPANY } from '$lib/legal/company-info'
</script>

<svelte:head>
  <title>Реєстрація — Zunor</title>
</svelte:head>

<!-- Та сама рамка, що й на вході: знак, заголовок із посиланням на вхід,
     під ним форма. Тексти — переклад ClickUp у стилі їхньої української
     сторінки входу («обліковий запис», «Робоча електронна пошта»). -->
<AuthShell title="Реєстрація за лічені секунди!" mark="password">
  {#snippet subtitle()}
    Вже маєте обліковий запис?
    <a
      href="/user/login"
      class="text-primary underline-offset-4 transition-colors hover:text-primary-hover hover:underline"
    >
      Увійти
    </a>
  {/snippet}

  <!-- Юридичний рядок унизу сторінки, як у ClickUp: саме тут людина
       приймає умови, і другого такого екрана немає. Сірий текст, а
       посилання — кольору тексту, з підкресленням під курсором. -->
  {#snippet footer()}
    <p
      class="text-center text-[13px] leading-normal text-balance text-muted-foreground/75"
    >
      Продовжуючи, ви погоджуєтеся з нашими
      <a
        href="/terms"
        target="_blank"
        rel="noopener noreferrer"
        class="text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        Умовами використання
      </a>
      і
      <a
        href="/privacy"
        target="_blank"
        rel="noopener noreferrer"
        class="text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        Політикою конфіденційності</a
      >.
      <a
        href="mailto:{COMPANY.supportEmail}"
        class="text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        Потрібна допомога?
      </a>
    </p>
  {/snippet}

  <SignupForm />
</AuthShell>
