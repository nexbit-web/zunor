<!-- src/lib/components/zuna.svelte -->
<!--
  Zuna — голос помічниці продукту.
  Тепло, на «ти», від першої особи.
  typewriter: ефект друкування (Zuna ніби пише в реальному часі).
-->
<script lang="ts">
  import { onMount } from 'svelte'

  interface Props {
    text?: string
    size?: number
    variant?: 'inline' | 'card'
    showName?: boolean
    /** Ефект друкування по буквах. Працює тільки з text (не children). */
    typewriter?: boolean
    /** Зелений індикатор "онлайн" на аватарі. */
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

  let displayed = $state(typewriter ? '' : text)
  let typing = $state(false) // показуємо "..." індикатор перед друком

  onMount(() => {
    if (!typewriter || !text) return

    typing = true
    // Коротка пауза "Zuna друкує..." перед початком
    const startDelay = setTimeout(() => {
      typing = false
      let i = 0
      const tick = () => {
        if (i <= text.length) {
          displayed = text.slice(0, i)
          i++
          // Невелика випадковість швидкості — як жива людина
          timer = setTimeout(tick, 18 + Math.random() * 30)
        }
      }
      tick()
    }, 700)

    let timer: ReturnType<typeof setTimeout>
    return () => {
      clearTimeout(startDelay)
      clearTimeout(timer)
    }
  })

  const isTypingDone = $derived(!typewriter || displayed.length >= text.length)
</script>

<div
  class="flex items-start gap-3 {variant === 'card' ? 'p-4 rounded-2xl' : ''}"
 
>
  <div class="relative shrink-0" style="width: {size}px; height: {size}px">
    <img
      src="/zuna-avatar.webp"
      alt="Zuna"
      width={size}
      height={size}
      loading="lazy"
      class="rounded-full object-cover w-full h-full"
    />
    {#if online}
      <span
        class="absolute bottom-0 right-0 rounded-full ring-2"
        style="width: {Math.max(10, size * 0.26)}px; height: {Math.max(
          10,
          size * 0.26,
        )}px; background-color: #22c55e; --tw-ring-color: var(--secondary)"
        aria-label="онлайн"
      ></span>
    {/if}
  </div>
  <div class="min-w-0 flex-1 pt-0.5">
    {#if showName}
      <p
        class="text-sm font-semibold mb-0.5 flex items-center gap-1.5"
        style="color: var(--foreground)"
      >
        Zuna - AI
      </p>
    {/if}

    {#if typing}
      <!-- Індикатор "друкує" -->
      <div class="flex items-center gap-1 h-5" aria-label="Zuna друкує">
        <span class="zuna-dot"></span>
        <span class="zuna-dot"></span>
        <span class="zuna-dot"></span>
      </div>
    {:else}
      <div class="text-sm leading-relaxed" style="color: var(--foreground)">
        {#if children}
          {@render children()}
        {:else}
          {displayed}{#if !isTypingDone}<span class="zuna-caret">|</span>{/if}
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .zuna-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--muted-foreground);
    animation: zuna-bounce 1.2s infinite ease-in-out;
  }
  .zuna-dot:nth-child(2) {
    animation-delay: 0.15s;
  }
  .zuna-dot:nth-child(3) {
    animation-delay: 0.3s;
  }
  @keyframes zuna-bounce {
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
  .zuna-caret {
    animation: zuna-blink 0.8s step-end infinite;
    font-weight: 400;
    opacity: 0.7;
  }
  @keyframes zuna-blink {
    50% {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .zuna-dot,
    .zuna-caret {
      animation: none;
    }
  }
</style>
