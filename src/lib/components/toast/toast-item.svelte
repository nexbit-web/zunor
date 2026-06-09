<script lang="ts">
  import { onMount } from 'svelte'
  import {
    toastStore,
    type ToastItem,
    type ToastPosition,
  } from '$lib/stores/toast-store.svelte'
  import { ICONS, CloseIcon } from './icons'

  let { item }: { item: ToastItem } = $props()

  let entered = $state(false)
  let paused = $state(false)

  const hasDuration = item.duration > 0

  // Іконка за типом тоста (тип фіксований протягом життя тоста)
  const Icon = ICONS[item.type]

  // Лише таймер закриття. Прогрес-бар крутить CSS (нуль JS під час відліку).
  let timer: ReturnType<typeof setTimeout> | null = null
  let startTime = 0
  let elapsed = 0

  // Напрямок виїзду за позицією контейнера
  const DIR: Record<ToastPosition, string> = {
    'top-left': 'from-left',
    'bottom-left': 'from-left',
    'top-right': 'from-right',
    'bottom-right': 'from-right',
    'top-center': 'from-top',
    'bottom-center': 'from-bottom',
  }
  const dirClass = DIR[item.position]

  // Помилки оголошуємо асертивно, решту — ввічливо (a11y)
  const liveRole = $derived(item.type === 'error' ? 'alert' : 'status')

  function startTimer(): void {
    if (!hasDuration) return
    startTime = Date.now()
    timer = setTimeout(
      () => toastStore.dismiss(item.id),
      item.duration - elapsed,
    )
  }

  function pause(): void {
    if (!hasDuration || !timer) return
    clearTimeout(timer)
    timer = null
    elapsed += Date.now() - startTime
    paused = true // → CSS зупиняє прогрес-бар
  }

  function resume(): void {
    if (!hasDuration || timer || item.leaving) return
    if (elapsed >= item.duration) {
      toastStore.dismiss(item.id)
      return
    }
    paused = false
    startTimer()
  }

  function close(): void {
    toastStore.dismiss(item.id)
  }

  function onAction(): void {
    item.action?.onClick?.(item.id)
  }

  onMount(() => {
    // дабл-rAF: малюємо схований стан, тоді вмикаємо .in → анімація входу
    requestAnimationFrame(() => requestAnimationFrame(() => (entered = true)))
    startTimer()
    return () => {
      if (timer) clearTimeout(timer)
    }
  })
</script>

<li
  class="toast-item pointer-events-auto max-w-full {dirClass} {entered &&
  !item.leaving
    ? 'in'
    : ''} {item.leaving ? 'out' : ''}"
  role={liveRole}
  onmouseenter={pause}
  onmouseleave={resume}
>
  <div class="toast-inner">
    <div
      class="t-{item.type} rounded-xl border-[0.5px] shadow-2xl p-3 text-[14px] leading-relaxed overflow-hidden"
    >
      <div class="flex gap-3 justify-between items-start px-0.5">
        <div class="flex min-w-0 items-start gap-2.5">
          <div
            class="t-icon shrink-0 mt-0.5 flex items-center justify-center w-5 h-5"
            aria-hidden="true"
          >
            <Icon class="size-4.5" strokeWidth={2.25} />
          </div>
          <div class="min-w-0 wrap-break-word select-text pt-px">
            <p>
              {item.message}
              {#if item.action}
                <button
                  type="button"
                  onclick={onAction}
                  class="t-action inline font-medium underline underline-offset-[3px] opacity-90 hover:opacity-100 transition-opacity ml-1 cursor-pointer"
                >
                  {item.action.label}
                </button>
              {/if}
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={close}
          class="t-close shrink-0 flex items-center justify-center w-6 h-6 rounded-md opacity-60 transition-all hover:opacity-100 cursor-pointer -mt-0.5 -mr-1"
          aria-label="Закрити сповіщення"
        >
          <CloseIcon class="size-3.5" strokeWidth={2.5} />
        </button>
      </div>

      {#if hasDuration}
        <div
          class="t-progress-track w-full h-0.5 mt-2.5 rounded-full overflow-hidden"
          aria-hidden="true"
        >
          <div
            class="t-progress-bar h-full"
            class:paused
            style="animation-duration: {item.duration}ms"
          ></div>
        </div>
      {/if}
    </div>
  </div>
</li>
