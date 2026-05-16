<!--
  src/lib/components/ui/lazy-mount.svelte

  Універсальний компонент: монтує дочірні елементи тільки коли контейнер
  потрапляє у viewport. Використовує IntersectionObserver.

  Корисно для важких секцій нижче fold: галереї, списки відгуків, графіки.
  Зменшує initial JS execution time і покращує FCP/LCP.

  Використання:
    <LazyMount minHeight="200px" rootMargin="200px">
      {#snippet children()}
        <HeavyComponent />
      {/snippet}
    </LazyMount>

  Поки контент не змонтований — показується skeleton-плейсхолдер
  (передається через slot або висота задається через minHeight).
-->
<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    /** Snippet з вмістом який буде відрендерено після появи у viewport */
    children: Snippet
    /** Опціональний skeleton-плейсхолдер до завантаження */
    placeholder?: Snippet
    /**
     * Розмір rootMargin для IntersectionObserver.
     * '200px' = почати рендер коли до елемента 200px скролу — щоб встигло
     * відрендеритись до того, як юзер його побачить.
     */
    rootMargin?: string
    /** Мінімальна висота плейсхолдера щоб не було стрибків layout */
    minHeight?: string
    /**
     * Якщо true — після появи у viewport залишається змонтованим назавжди.
     * Якщо false — буде демонтовуватись коли виходить з viewport (рідко треба).
     */
    once?: boolean
  }

  let {
    children,
    placeholder,
    rootMargin = '200px',
    minHeight = '100px',
    once = true,
  }: Props = $props()

  let container: HTMLDivElement
  let visible = $state(false)

  $effect(() => {
    if (!container) return

    // SSR / старий браузер — рендеримо одразу
    if (typeof IntersectionObserver === 'undefined') {
      visible = true
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible = true
            if (once) io.disconnect()
          } else if (!once) {
            visible = false
          }
        }
      },
      { rootMargin },
    )

    io.observe(container)
    return () => io.disconnect()
  })
</script>

<div bind:this={container} style="min-height: {visible ? 'auto' : minHeight}">
  {#if visible}
    {@render children()}
  {:else if placeholder}
    {@render placeholder()}
  {/if}
</div>
