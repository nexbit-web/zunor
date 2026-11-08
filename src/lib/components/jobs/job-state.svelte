<!--
  Плашка стану заявки — у рядку списку й на сторінці самої заявки. Одна
  на обидва місця, щоб заявка, відкрита зі списку, впізнавалась з першого
  погляду: той самий напис, той самий колір.
-->
<script lang="ts">
  import { jobState, type JobTone } from './display'

  let {
    status,
    proposalsCount = 0,
    viewer = 'client',
  }: {
    status: string
    proposalsCount?: number | null
    viewer?: 'client' | 'master'
  } = $props()

  const current = $derived(jobState({ status, proposalsCount }, viewer))

  const TONE: Record<JobTone, string> = {
    action: 'bg-primary text-primary-foreground',
    live: 'bg-primary/10 text-primary',
    progress: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
    done: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
    off: 'bg-muted text-muted-foreground',
  }
</script>

<span
  class={[
    'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium whitespace-nowrap',
    TONE[current.tone],
  ]}
>
  {#if current.tone === 'live'}
    <!-- Пульс — «пошук іде просто зараз». Рівно один на рядок: якби
         дихало все, не казало б нічого. -->
    <span class="live-dot size-1.5 rounded-full bg-primary"></span>
  {/if}
  {current.label}
</span>

<style>
  .live-dot {
    animation: live-pulse 2s ease-in-out infinite;
  }
  @keyframes live-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .live-dot {
      animation: none;
    }
  }
</style>
