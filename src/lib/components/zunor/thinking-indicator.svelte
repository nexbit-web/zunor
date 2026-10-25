<script lang="ts">
  // «Думаю…», доки модель не дала першого слова: персонаж, що думає, і
  // лічильник секунд. Довга пауза без лічильника виглядає як зависання.
  //
  // Не Marker: його корінь примусово стискає КОЖЕН вкладений <svg> до
  // size-4, а полотно Lottie — теж <svg>, тож голова стала б крихітною.
  import { onMount } from 'svelte'
  import { ZunorMarkAnimated } from '$lib/components/icons'

  /** Лічильник зʼявляється не одразу: на коротких ходах він лише миготить. */
  const SHOW_AFTER_SEC = 3

  let seconds = $state(0)

  onMount(() => {
    const startedAt = Date.now()
    const timer = setInterval(() => {
      seconds = Math.floor((Date.now() - startedAt) / 1000)
    }, 1000)
    return () => clearInterval(timer)
  })
</script>

<div
  class="flex items-center gap-2 text-[15px] text-muted-foreground"
  role="status"
>
  <!-- Висотою з рядок тексту: персонаж — супровід до «Думаю…», а не
       ілюстрація. Стрибок у сценці «еврика» виходить за ці межі вгору й
       сусідів не зсуває (див. ZunorMarkAnimated). -->
  <ZunorMarkAnimated
    animation="thinking"
    class="h-5 shrink-0 text-foreground"
  />
  <span class="shimmer text-foreground/70 motion-reduce:shimmer-none"
    >Думаю…</span
  >
  {#if seconds >= SHOW_AFTER_SEC}
    <!-- aria-hidden: інакше скрінрідер оголошував би кожну секунду. -->
    <span
      class="text-[13px] text-muted-foreground/70 tabular-nums"
      aria-hidden="true">{seconds} с</span
    >
  {/if}
</div>
