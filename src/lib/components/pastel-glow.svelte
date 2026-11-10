<!-- Пастельна смуга вгорі екрана: персиковий, рожевий, бузковий, блакитний —
     як у ClickUp (там це картинка на 30% висоти й 175% ширини). Маска
     розчиняє її донизу, тож межі ніде не видно. У темній темі — ледь
     помітний відтінок: яскрава пастель на чорному виглядала б плямою.

     Батько — `relative`, а вміст поверх смуги — теж `relative`, інакше
     смуга ляже на нього. Спільна для рамки входу (AuthShell) і сторінки
     помилки. -->
<div class="glow" aria-hidden="true"></div>

<style>
  .glow {
    position: absolute;
    inset-inline: 0;
    top: 0;
    height: 30%;
    min-height: 12rem;
    pointer-events: none;
    background: linear-gradient(
      100deg,
      #fde3d3 0%,
      #f7d0e8 28%,
      #e4dafb 58%,
      #d3e6fd 100%
    );
    mask-image: linear-gradient(to bottom, #000 0%, transparent 100%);
    opacity: 0.9;
  }

  :global(.dark) .glow {
    opacity: 0.14;
  }
</style>
