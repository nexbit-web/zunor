<!--
  Плашка «Скопійовано» посередині екрана, як у Telegram: темна напівпрозора
  капсула, що спалахує й гасне сама. Результату копіювання не видно очима,
  тож підтвердження потрібне (AGENTS, «Коли тост потрібен»), але картка з
  іконкою в куті — забагато для такої дрібниці: плашка стоїть там, куди
  людина й так дивиться, і ні на що не тисне.

  Монтує її той самий <Toaster>, що й решту тостів (`showCopied` у
  $lib/utils/clipboard): таймер і заміна за id — бібліотечні. Своє тут —
  лише вигляд і місце на екрані.
-->
<script lang="ts" module>
  import type { Toast } from 'svelte-hot-french-toast'

  // Псевдонім типу, а не interface: toast.custom вимагає пропсів виду
  // Record<string, unknown>, а інтерфейс без індексу ним не вважається.
  export type CopiedToastProps = {
    toast: Toast
    text: string
  }
</script>

<script lang="ts">
  let { toast: t, text }: CopiedToastProps = $props()
</script>

<!-- Повторне копіювання — це нова плашка (новий id, див. showCopied), тож
     вона й так «спалахує» заново: видно, що друге натискання спрацювало. -->
<div class="copied" class:leaving={!t.visible}>{text}</div>

<style>
  /* Обгортка бібліотеки стоїть біля краю екрана й зсунута transform-ом
     (стос тостів), тож position: fixed усередині рахувався б від неї, а не
     від вікна. Тому в центр ставимо саму обгортку: контейнер тостера — на
     весь екран з однаковими полями, і його 50% — це середина вікна.
     top/bottom бібліотека пише інлайном, звідси !important. */
  :global(.svelte-hot-french-toast__wrapper:has(.copied)) {
    top: 50% !important;
    bottom: auto !important;
    transform: translateY(-50%) !important;
  }

  /* Повідомлення бібліотеки тягнеться на всю ширину — без цього смуга
     посеред екрана перехоплювала б кліки, поки висить плашка. */
  :global(.svelte-hot-french-toast__message:has(> .copied)) {
    pointer-events: none;
  }

  .copied {
    max-width: min(340px, calc(100vw - 48px));
    padding: 10px 20px;
    border-radius: 20px;
    background: rgb(0 0 0 / 0.68);
    color: #fff;
    font-size: 15px;
    font-weight: 500;
    line-height: 1.3;
    letter-spacing: -0.01em;
    text-align: center;
    -webkit-backdrop-filter: blur(12px) saturate(150%);
    backdrop-filter: blur(12px) saturate(150%);
    pointer-events: none;
    animation: copied-in 220ms cubic-bezier(0.2, 0.9, 0.3, 1.15) both;
    transition:
      opacity 180ms ease,
      transform 180ms ease;
  }

  /* На темному тлі чорна плашка зникла б — там вона на тон світліша за
     сторінку, з ледь помітним контуром. */
  :global(.dark) .copied {
    background: rgb(70 70 69 / 0.94);
    box-shadow:
      inset 0 0 0 1px rgb(255 255 255 / 0.06),
      0 10px 28px -12px rgb(0 0 0 / 0.6);
  }

  .copied.leaving {
    opacity: 0;
    transform: scale(0.94);
  }

  @keyframes copied-in {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .copied {
      animation: none;
      transition: opacity 180ms ease;
    }
    .copied.leaving {
      transform: none;
    }
  }
</style>
