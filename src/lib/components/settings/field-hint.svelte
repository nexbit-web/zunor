<script lang="ts">
  // Підказка до поля — маленька іконка біля підпису, текст у тултипі.
  //
  // Раніше підказка стояла рядком під підписом («Видно клієнту після
  // підтвердження»), і на кожне поле припадало по два рядки тексту. Ця
  // інформація потрібна, коли виникає питання, а не весь час на очах.
  //
  // Тултип відкривається і наведенням, і натиском: на телефоні наведення
  // немає, а підказка про те, кому видно номер, там важить не менше.
  // Сам текст лежить у кнопці для скрінрідера — закритий тултип у DOM
  // відсутній, і без цього підказку не почув би ніхто.
  import * as Tooltip from '$lib/components/ui/tooltip/index.js'
  import { Info } from 'lucide-svelte'

  let { text }: { text: string } = $props()

  let open = $state(false)
</script>

<!-- Власний Provider: поле буває й поза дашбордом (онбординг), де
     спільного з панеллю немає. -->
<Tooltip.Provider delayDuration={100}>
  <Tooltip.Root bind:open disableCloseOnTriggerClick>
    <Tooltip.Trigger onclick={() => (open = !open)}>
      {#snippet child({ props })}
        <button
          {...props}
          type="button"
          class="inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Info class="size-3.5" aria-hidden="true" />
          <span class="sr-only">{text}</span>
        </button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content
      side="top"
      sideOffset={6}
      class="max-w-64 text-[12.5px] leading-snug"
    >
      {text}
    </Tooltip.Content>
  </Tooltip.Root>
</Tooltip.Provider>
