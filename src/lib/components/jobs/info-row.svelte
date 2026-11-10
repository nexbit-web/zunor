<!--
  Рядок «підпис — значення» всередині картки SettingsGroup: характеристики
  заявки, ціна й термін пропозиції.

  Не SettingsRow: той на телефоні складається стовпчиком (під підписом —
  кнопка чи перемикач), а коротке значення під підписом читалось би як
  окремий пункт списку. Лінія та сама — втоплена від країв картки.
-->
<script lang="ts">
  import type { Snippet } from 'svelte'

  let { label, children }: { label: string; children: Snippet } = $props()
</script>

<div
  class="mx-4 flex items-center justify-between gap-4 border-t border-border/60 py-3 text-sm first:border-t-0"
>
  <span class="shrink-0 text-muted-foreground">{label}</span>
  <span class="min-w-0 text-right font-medium wrap-break-word text-foreground">
    {@render children()}
  </span>
</div>
