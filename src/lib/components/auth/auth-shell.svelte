<script lang="ts">
  // Спільна рамка сторінок входу, реєстрації, відновлення пароля й вибору
  // ролі в онбордингу. Геометрія знята зі сторінки входу ClickUp: колонка
  // 400px по центру, знак 36px, під ним заголовок 18px напівжирним і рядок
  // 14px сірим із посиланням на сусідню сторінку, потім форма. Угорі —
  // мʼякий кольоровий відсвіт на 30% висоти.
  //
  // Окремого «Головна» в кутку немає: знак над формою сам веде на
  // головну, а друге посилання туди ж було б зайвим на екрані з однією
  // дією.
  import type { Snippet } from 'svelte'
  import {
    ZunorMark,
    ZunorMarkAnimated,
    ZunorPasswordPeek,
    type MarkAnimationName,
  } from '$lib/components/icons'
  import PastelGlow from '$lib/components/pastel-glow.svelte'
  import { COMPANY } from '$lib/legal/company-info'
  import { providePasswordField } from './password-field.svelte'

  interface Props {
    title: string
    /**
     * Анімований знак замість статичного — розмір і місце ті самі.
     * 'password' — знак, що стежить за полем пароля у формі (PasswordInput).
     */
    mark?: MarkAnimationName | 'password'
    /** Рядок під заголовком — зазвичай посилання на сусідню сторінку. */
    subtitle: Snippet
    /**
     * Рядок унизу сторінки. За замовчуванням — «Потрібна допомога?»;
     * реєстрація ставить сюди юридичний рядок, у кінці якого те саме
     * посилання, як у ClickUp.
     */
    footer?: Snippet
    /**
     * Тег колонки з формою. Онбординг ставить 'div': лейаут дашборда вже
     * загортає його в <main>, а другий <main> усередині — два головні
     * орієнтири на сторінці для скрінрідера.
     */
    as?: 'main' | 'div'
    children: Snippet
  }

  let { title, mark, subtitle, footer, as = 'main', children }: Props = $props()

  const passwordField = providePasswordField()
</script>

<div class="relative flex min-h-svh flex-col bg-background">
  <PastelGlow />

  <svelte:element
    this={as}
    class="relative flex flex-1 items-center justify-center px-5 pt-12 pb-8"
  >
    <div class="w-full max-w-100">
      <header class="mb-4 flex flex-col items-center text-center">
        <a
          href="/"
          aria-label="Zunor — на головну"
          class="mb-3 rounded-[8px] text-foreground transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          {#if mark === 'password'}
            <!-- Вище за звичайний знак: руки під головою мають бути видно. -->
            <ZunorPasswordPeek
              filled={passwordField.filled}
              visible={passwordField.visible}
              class="block h-14"
            />
          {:else if mark}
            <ZunorMarkAnimated animation={mark} class="block h-9" />
          {:else}
            <ZunorMark class="block h-9 w-auto" />
          {/if}
        </a>

        <h1 class="mb-1 text-[18px] leading-tight font-semibold">
          {title}
        </h1>
        <p class="text-[14px] leading-normal text-muted-foreground">
          {@render subtitle()}
        </p>
      </header>

      {@render children()}
    </div>
  </svelte:element>

  {#if footer}
    <div class="relative mx-auto mb-6 px-5">
      {@render footer()}
    </div>
  {:else}
    <!-- У потоці, а не fixed: на низькому екрані fixed-посилання лягало б
         поверх форми, і ClickUp для цього тримає окремий детектор
         перекриття. Внизу колонки воно стоїть там само без нього.
         Світліше й на піксель дрібніше за «Забули пароль?»: це запасний
         вихід, а не частина форми. Під курсором — підкреслення й повний
         колір тексту. -->
    <a
      href="mailto:{COMPANY.supportEmail}"
      class="relative mx-auto mb-6 rounded-sm text-[13px] text-muted-foreground/75 underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      Потрібна допомога?
    </a>
  {/if}
</div>
