<!--
  Сповіщення поверх сторінки — картка з дією, як сповіщення macOS:
  плитка-іконка кольору події, рядок «Нова заявка · щойно», заголовок,
  подробиці й кнопка дії. Тост, який лише каже «щось сталось», змушував
  шукати це «щось» по меню; тут до заявки чи замовлення — один дотик.

  Монтує її svelte-hot-french-toast як custom-тост (toast.ts), тож
  <Toaster> лишається один: таймер, пауза під курсором і черга — бібліотечні.
  Компонент лише малює й реагує на toast.visible: бібліотека ставить false,
  коли час вийшов або тост закрили, і за секунду прибирає його з DOM —
  у цю секунду картка тане.

  Поверхня — тієї ж теми, що й застосунок (біла / тон карток), з
  тонкою рамкою й багатошаровою тінню. Колишній чорний «острів» у стилі
  Dynamic Island на світлій сторінці виглядав чужим, а капсула з
  вогником, що розкривалась у картку, — іграшкою, а не сповіщенням.
  Назва файлу й клас лишились від нього.
-->
<script lang="ts" module>
  import type { Component } from 'svelte'
  import type { Toast } from 'svelte-hot-french-toast'

  export type IslandTone = 'accent' | 'success' | 'danger' | 'warning'

  // Псевдонім типу, а не interface: toast.custom вимагає пропсів виду
  // Record<string, unknown>, а інтерфейс без індексу ним не вважається.
  export type IslandProps = {
    toast: Toast
    /** Одне-два слова над заголовком: «Нова заявка». */
    label: string
    title: string
    body?: string | null
    /** Напис на кнопці дії: «Переглянути заявку». */
    action: string
    href: string
    icon: Component<{ class?: string }>
    tone?: IslandTone
    /** Тривалість тоста — з неї ж біжить кільце навколо хрестика. */
    duration: number
    /** Перехід за сповіщенням — воно прочитане (позначає стор). */
    onopen?: () => void
  }
</script>

<script lang="ts">
  import { goto } from '$app/navigation'
  import toast from 'svelte-hot-french-toast'
  import { Button } from '$lib/components/ui/button'
  import XIcon from '$lib/components/icons/set/x.svelte'
  import ArrowRightIcon from '$lib/components/icons/set/arrow-right.svelte'

  let {
    toast: t,
    label,
    title,
    body,
    action,
    href,
    icon: Icon,
    tone = 'accent',
    duration,
    onopen,
  }: IslandProps = $props()

  function close(): void {
    toast.dismiss(t.id)
  }

  function go(): void {
    onopen?.()
    close()
    void goto(href)
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') close()
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="island"
  class:leaving={!t.visible}
  data-tone={tone}
  style:--duration="{duration}ms"
  role="status"
  aria-live="polite"
  {onkeydown}
>
  <button type="button" class="row" onclick={go}>
    <span class="tile"><Icon class="size-4.5" /></span>
    <span class="min-w-0 flex-1 text-left">
      <span class="meta">
        <span class="label">{label}</span>
        <span class="time">· щойно</span>
      </span>
      <span class="title">{title}</span>
      {#if body}
        <span class="body">{body}</span>
      {/if}
    </span>
  </button>

  <!-- Кільце — скільки лишилось до зникнення. Під курсором стоїть разом
       із таймером бібліотеки (вона ставить на паузу весь тостер). -->
  <button
    type="button"
    class="close"
    onclick={close}
    aria-label="Закрити сповіщення"
  >
    <svg class="countdown" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="12.25" pathLength="100" />
    </svg>
    <XIcon class="size-3.5" />
  </button>

  <div class="actions">
    <Button size="sm" variant="primary" onclick={go}>
      {action}
      <ArrowRightIcon data-icon="inline-end" />
    </Button>
    <Button
      size="sm"
      variant="ghost"
      class="text-muted-foreground"
      onclick={close}
    >
      Пізніше
    </Button>
  </div>
</div>

<style>
  /* Обгортка бібліотеки — смуга на всю ширину над сторінкою. Без цього
     вона перехоплювала б кліки по шапці навколо картки. Свої відступи й
     центрування бібліотеки тут зайві: картка стоїть у правому кутку
     (позиція top-end — toast.ts).

     Селектор навмисно на клас довший за бібліотечний: з однаковою вагою
     перемагав той, чий CSS підвантажився пізніше, і в dev це була
     бібліотека — картка ставала посередині. */
  :global(
    .svelte-hot-french-toast__wrapper
      > .svelte-hot-french-toast__message:has(> .island)
  ) {
    justify-content: flex-end;
    pointer-events: none;
    margin: 0;
    white-space: normal;
  }

  .island {
    /* Колір події: плитка (--tone з текстом --tone-fg) і підпис над
       заголовком (--tone-text). Акцент — з налаштувань «Вигляду»;
       решта — кольори статусів GitHub, світлі й темні. */
    --tone: var(--primary);
    --tone-fg: var(--primary-foreground);
    --tone-text: var(--primary);

    position: relative;
    /* Друга страховка від центрування: зовнішній відступ «auto» забирає
       весь вільний простір ліворуч, хоч би що стояло в justify-content
       обгортки. */
    margin-inline-start: auto;
    width: min(380px, calc(100vw - 32px));
    padding: 14px 14px 14px 14px;
    border: 1px solid rgb(0 0 0 / 0.08);
    border-radius: 14px;
    background: var(--card);
    color: var(--card-foreground);
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.04),
      0 4px 8px -2px rgb(0 0 0 / 0.05),
      0 16px 36px -10px rgb(0 0 0 / 0.18);
    pointer-events: auto;
    font-size: 13.5px;
    letter-spacing: -0.006em;
    /* backwards, а не both: заповнений кінцевий кадр анімації перекрив
       би transform, і перехід .leaving не поїхав би — картка зникала б
       стрибком. */
    animation: slide-in 600ms cubic-bezier(0.22, 1.12, 0.36, 1) backwards;
    transition:
      opacity 280ms ease,
      transform 320ms cubic-bezier(0.55, 0, 1, 0.45);
  }

  :global(.dark) .island {
    --tone-text: color-mix(in srgb, var(--primary) 72%, white);
    border-color: var(--border);
    box-shadow:
      0 2px 6px rgb(0 0 0 / 0.4),
      0 16px 40px -8px rgb(0 0 0 / 0.7);
  }

  .island[data-tone='success'] {
    --tone: #1f883d;
    --tone-fg: #fff;
    --tone-text: #1a7f37;
  }
  .island[data-tone='danger'] {
    --tone: #cf222e;
    --tone-fg: #fff;
    --tone-text: #d1242f;
  }
  .island[data-tone='warning'] {
    --tone: #bf8700;
    --tone-fg: #fff;
    --tone-text: #9a6700;
  }
  :global(.dark) .island[data-tone='success'] {
    --tone: #238636;
    --tone-text: #3fb950;
  }
  :global(.dark) .island[data-tone='danger'] {
    --tone: #da3633;
    --tone-text: #f85149;
  }
  :global(.dark) .island[data-tone='warning'] {
    --tone: #9e6a03;
    --tone-text: #d29922;
  }

  /* Як сповіщення macOS: виїжджає з-за правого краю екрана, ледь
     перелітає місце й осідає (пружина), а йде — назад за край. 24px —
     відступ тостера від краю плюс запас, щоб тінь теж сховалась. */
  .island.leaving {
    opacity: 0;
    transform: translateX(calc(100% + 24px));
  }

  @keyframes slide-in {
    from {
      transform: translateX(calc(100% + 24px));
    }
  }

  /* На телефоні картка майже на всю ширину — там вона падає згори, як
     банер iPhone, і так само йде вгору. */
  @keyframes drop-in {
    from {
      opacity: 0;
      transform: translateY(-24px) scale(0.96);
    }
  }
  @media (max-width: 639px) {
    .island {
      animation-name: drop-in;
    }
    .island.leaving {
      transform: translateY(-16px) scale(0.96);
    }
  }

  /* ─── Зміст ─── */
  .row {
    display: flex;
    width: 100%;
    align-items: flex-start;
    gap: 12px;
    padding-right: 30px;
    border-radius: 10px;
    color: inherit;
    cursor: pointer;
  }

  /* Плитка, як іконка застосунку в сповіщеннях macOS: заливка кольором
     події з ледь світлішим верхом і світлим відблиском по краю. */
  .tile {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--tone) 80%, white),
      var(--tone)
    );
    color: var(--tone-fg);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.22),
      inset 0 0 0 1px rgb(0 0 0 / 0.06),
      0 1px 2px rgb(0 0 0 / 0.12);
  }

  .meta {
    display: flex;
    align-items: baseline;
    gap: 4px;
    font-size: 12.5px;
    line-height: 1.2;
    white-space: nowrap;
  }
  .label {
    overflow: hidden;
    color: var(--tone-text);
    font-weight: 600;
    text-overflow: ellipsis;
  }
  .time {
    color: var(--muted-foreground);
  }

  .title {
    display: block;
    margin-top: 3px;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.35;
  }

  .body {
    display: -webkit-box;
    margin-top: 2px;
    overflow: hidden;
    color: var(--muted-foreground);
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  /* Кнопки — під текстом, на одній вертикалі з ним (плитка 36 + 12). */
  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 12px;
    padding-left: 48px;
  }

  /* ─── Хрестик із кільцем часу ─── */
  .close {
    position: absolute;
    top: 10px;
    right: 10px;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 9999px;
    color: var(--muted-foreground);
    cursor: pointer;
    transition:
      background-color 150ms ease,
      color 150ms ease;
  }
  .close:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  /* Розмір явно: замінюваний елемент (svg) з inset: 0 не розтягується,
     а бере власний — 300×150. Клас не «ring»: це утиліта Tailwind
     (рамка 1px поточним кольором), і вона малювала квадрат довкола. */
  .countdown {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    rotate: -90deg;
    pointer-events: none;
  }
  .countdown circle {
    fill: none;
    stroke: var(--tone-text);
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-dasharray: 100;
    opacity: 0.45;
    animation: drain var(--duration) linear forwards;
  }
  .island:hover .countdown circle {
    animation-play-state: paused;
  }
  @keyframes drain {
    to {
      stroke-dashoffset: 100;
    }
  }

  .row:focus-visible,
  .close:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .island {
      animation: none;
      transition: none;
    }
    .countdown circle {
      animation: none;
    }
  }
</style>
