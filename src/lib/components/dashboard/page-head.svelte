<script lang="ts">
  // Шапка сторінки дашборда: липне до верху, контент іде ПІД неї.
  //
  // Межа — волосина знизу, і лише коли під шапкою справді щось є. Раніше
  // замість неї був градієнт на 36px під шапкою, і він лягав на перший
  // рядок списку навіть у спокої: відступ під шапкою — 16px, тож верх
  // першої картки завжди виглядав вицвілим, а на прокрутці картки
  // «розмивались» під заголовком.
  //
  // Верхній відступ на телефоні не косметичний: там у лівому верхньому
  // куті плаває кнопка меню (`mobile-trigger`), і без запасу під неї
  // список проїжджав прямо крізь іконку.
  //
  // Від'ємні поля — на всю ширину контейнера сторінки, ширше за рядки
  // списку (ті виходять за текстову колонку на 12px підсвіткою): інакше
  // краї рядків визирали б з-під шапки на проїзді.

  import type { Snippet } from 'svelte'

  let { children }: { children: Snippet } = $props()

  // Сторож над шапкою: поки його видно, сторінка не прокручена і межа не
  // потрібна. Спостерігач, а не scroll-подія: прокручується то вікно
  // (телефон), то панель дашборда (десктоп), і слухати довелося б обидва.
  let sentinel = $state<HTMLDivElement | null>(null)
  let stuck = $state(false)

  $effect(() => {
    const el = sentinel
    if (!el) return
    const obs = new IntersectionObserver(([e]) => (stuck = !e.isIntersecting))
    obs.observe(el)
    return () => obs.disconnect()
  })
</script>

<div bind:this={sentinel} class="h-px" aria-hidden="true"></div>
<div
  class={[
    'sticky top-0 z-20 -mx-4 border-b bg-background px-4 pt-16 pb-3 transition-colors duration-200 sm:-mx-6 sm:px-6 sm:pt-8',
    stuck ? 'border-border/70' : 'border-transparent',
  ]}
>
  {@render children()}
</div>
