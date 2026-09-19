<script lang="ts">
  // Шапка сторінки дашборда: липне до верху, і контент іде ПІД неї,
  // розчиняючись у фоні, а не обрізаючись рискою.
  //
  // Верхній відступ на телефоні не косметичний: там у лівому верхньому
  // куті плаває кнопка меню (`mobile-trigger`), і без запасу під неї
  // список проїжджав прямо крізь іконку. Тепер вона завжди лишається на
  // чистому фоні, а контент до самого верху не доходить.
  //
  // Від'ємні поля — на всю ширину контейнера сторінки, ШИРШЕ за рядки
  // списку (ті виходять за текстову колонку на 12px). Коли шапка була
  // вужчою, краї рядків визирали з-під неї на проїзді — саме те, що
  // читалось як «картка заїхала під меню».

  import type { Snippet } from 'svelte'

  let { children }: { children: Snippet } = $props()
</script>

<div
  class="page-head sticky top-0 z-20 -mx-4 bg-background px-4 pt-16 pb-1 sm:-mx-6 sm:px-6 sm:pt-8"
>
  {@render children()}
</div>

<style>
  /* Розчинення замість межі: градієнт живе ПІД шапкою (top: 100%), тому
     не з'їдає її власну висоту й не заважає кліку по вмісту. */
  .page-head::after {
    content: '';
    position: absolute;
    inset-inline: 0;
    top: 100%;
    height: 36px;
    background: linear-gradient(to bottom, var(--background), transparent);
    pointer-events: none;
  }
</style>
