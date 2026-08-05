<!-- src/lib/components/assistant-card.svelte -->
<!--
  Картка асистента платформи. Говорить від імені Zunor, у третій особі
  («Zunor шукає майстрів…»), без окремого персонажа — див. AGENTS.md,
  розділ про AI-агента. Тон теплий і людяний, але це голос сервісу.

  Повідомлення передається пропом `text` або через children (слот).
  typewriter — ефект друкування (лише для `text`); поважає reduced-motion.
-->
<script lang="ts">
  interface Props {
    text?: string
    size?: number
    variant?: 'inline' | 'card'
    showName?: boolean
    /** Ефект друкування по буквах. Працює лише з `text`, не з children. */
    typewriter?: boolean
    /** Зелений індикатор «онлайн» на аватарі. */
    online?: boolean
    children?: import('svelte').Snippet
  }

  let {
    text = '',
    size = 40,
    variant = 'inline',
    showName = false,
    typewriter = false,
    online = false,
    children,
  }: Props = $props()

  // Друкований текст потрібен лише в режимі typewriter; інакше рендеримо `text`
  // напряму. Тому стартуємо з порожнього рядка — без посилань на пропси тут.
  let displayed = $state('')
  let typing = $state(false) // показуємо «…» перед початком друку

  // Розмір індикатора «онлайн» — пропорційний аватару, але не менше 10px.
  const dotSize = $derived(Math.max(10, Math.round(size * 0.26)))
  const isTypingDone = $derived(displayed.length >= text.length)

  // Друкарка: залежить від `text`/`typewriter`, перезапускається при їх зміні
  // та прибирає таймери. Якщо користувач просить менше анімацій — показуємо одразу.
  $effect(() => {
    if (!typewriter || !text) return

    const reduceMotion =
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      typing = false
      displayed = text
      return
    }

    let charTimer: ReturnType<typeof setTimeout>
    typing = true
    displayed = ''

    // Коротка пауза «Zunor друкує…», далі друк по буквах із живою швидкістю.
    const startDelay = setTimeout(() => {
      typing = false
      let i = 0
      const tick = () => {
        displayed = text.slice(0, i)
        if (i < text.length) {
          i++
          charTimer = setTimeout(tick, 18 + Math.random() * 30)
        }
      }
      tick()
    }, 700)

    return () => {
      clearTimeout(startDelay)
      clearTimeout(charTimer)
    }
  })
</script>

<div
  class="flex items-start gap-3 {variant === 'card' ? 'p-4 rounded-2xl' : ''}"
>
  <div class="relative shrink-0" style="width: {size}px; height: {size}px">
    <img
      src="/assistant-avatar.webp"
      alt="Zunor"
      width={size}
      height={size}
      decoding="async"
      class="rounded-full object-cover w-full h-full"
    />
    {#if online}
      <span
        class="absolute bottom-0 right-0 rounded-full ring-2"
        style="width: {dotSize}px; height: {dotSize}px; background-color: #22c55e; --tw-ring-color: var(--secondary)"
        aria-label="онлайн"
      ></span>
    {/if}
  </div>

  <div class="min-w-0 flex-1 pt-0.5">
    {#if showName}
      <p class="text-sm font-semibold mb-0.5" style="color: var(--foreground)">
        Zunor · AI
      </p>
    {/if}

    {#if typing}
      <!-- Індикатор «друкує» -->
      <div class="flex items-center gap-1 h-5" aria-label="Zunor друкує">
        <span class="assistant-dot"></span>
        <span class="assistant-dot"></span>
        <span class="assistant-dot"></span>
      </div>
    {:else}
      <div class="text-sm leading-relaxed" style="color: var(--foreground)">
        {#if children}
          {@render children()}
        {:else if typewriter}
          {displayed}{#if !isTypingDone}<span
              class="assistant-caret"
              aria-hidden="true">|</span
            >{/if}
        {:else}
          {text}
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .assistant-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--muted-foreground);
    animation: assistant-bounce 1.2s infinite ease-in-out;
  }
  .assistant-dot:nth-child(2) {
    animation-delay: 0.15s;
  }
  .assistant-dot:nth-child(3) {
    animation-delay: 0.3s;
  }
  @keyframes assistant-bounce {
    0%,
    60%,
    100% {
      transform: translateY(0);
      opacity: 0.4;
    }
    30% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }
  .assistant-caret {
    animation: assistant-blink 0.8s step-end infinite;
    font-weight: 400;
    opacity: 0.7;
  }
  @keyframes assistant-blink {
    50% {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .assistant-dot,
    .assistant-caret {
      animation: none;
    }
  }
</style>
