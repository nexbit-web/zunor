<script lang="ts">
  // Блок на всю ширину картки — коли вміст не вкладається в «підпис
  // ліворуч, контрол праворуч»: вибір теми, довга textarea, список
  // об'єктів. Дає ті самі відступи й ту саму втоплену лінію, що й решта
  // рядків, тож сторінка не мусить пам'ятати класи картки.
  import type { Snippet } from 'svelte'

  interface Props {
    /** Вертикальні відступи більші за типові — для блоків із превʼю. */
    roomy?: boolean
    children: Snippet
  }

  let { roomy = false, children }: Props = $props()
</script>

<div
  class="mx-4 border-t border-border/60 first:border-t-0 {roomy
    ? 'py-5'
    : 'py-3'}"
>
  {@render children()}
</div>
