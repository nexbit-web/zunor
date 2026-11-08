<!--
  Тло першого екрана — велике розмите серце, як на першому екрані Lovable,
  у наших кольорах. Серце ширше за екран удвічі: доль цілком не видно,
  лише як вони здіймаються до країв, а ложбинка між ними — посередині,
  під полем вводу.

  Будова як у Lovable: кілька копій серця одна в одній — ореол
  (--glow-1, --glow-2) і ядро (--glow-3, --glow-4). Внутрішні копії менші
  й нижчі (зменшуються до точки під ложбинкою), тож кольори лягають
  смугами вздовж контуру, а під полем лишається синя «V» ореолу.

  Контур — класичне серце: ромб і два півкола на його верхніх сторонах.
  Малюємо лише верхню частину (viewBox обрізаний): низ серця все одно
  далеко за нижнім краєм блока, а шар у кілька разів менший.
-->
<script lang="ts">
  // Ромб із вершинами (500,900) (100,500) (500,100) (900,500), півкола
  // радіусом 282.84 на верхніх сторонах. Ложбинка — точка (500,100).
  const HEART =
    'M500 900L100 500A282.84 282.84 0 0 1 500 100A282.84 282.84 0 0 1 900 500Z'

  // Від зовнішнього до внутрішнього: змінна кольору й масштаб копії.
  // Самі кольори — у hero.svelte (.hero): ними ж малюються смуга по «AI»
  // в заголовку й підсвітка під полем, тож палітра міняється в одному місці.
  const HALO = [
    { color: 'var(--glow-1)', scale: 1 },
    { color: 'var(--glow-2)', scale: 0.9 },
  ]
  const CORE = [
    { color: 'var(--glow-3)', scale: 0.8 },
    { color: 'var(--glow-4)', scale: 0.7 },
  ]
</script>

<div class="glow" aria-hidden="true">
  <div class="glow-enter">
    <div class="glow-ambient">
      <div class="layer halo">
        {#each HALO as l (l.color)}
          <svg class="heart" viewBox="0 0 1000 600" preserveAspectRatio="none" style:--s={l.scale}>
            <path d={HEART} style:fill={l.color} />
          </svg>
        {/each}
      </div>
      <div class="layer core">
        {#each CORE as l (l.color)}
          <svg class="heart" viewBox="0 0 1000 600" preserveAspectRatio="none" style:--s={l.scale}>
            <path d={HEART} style:fill={l.color} />
          </svg>
        {/each}
      </div>
    </div>
  </div>
</div>
<div class="grain" aria-hidden="true"></div>

<style>
  .glow {
    position: absolute;
    inset: 0;
    pointer-events: none;
    /* Знизу розчиняється в сторінку: наступний блок стоїть на білому. */
    mask-image: linear-gradient(to bottom, #000 78%, transparent 100%);
  }
  :global(.dark) .glow {
    opacity: 0.85;
  }

  .glow-enter,
  .glow-ambient,
  .layer {
    position: absolute;
    inset: 0;
  }

  /* Серце вдвічі ширше за екран і трохи приплюснуте. Ложбинка — на 16.7%
     висоти малюнка (100 з 600 одиниць viewBox), тож зсув на -16.7% ставить
     її рівно на `top`, під поле вводу. Обрізаний низ малюнка лежить далеко
     за нижнім краєм блока й не видно. Внутрішні копії зменшуються до точки
     під ложбинкою — їхні ложбинки нижчі, і посередині лишається синя «V». */
  .heart {
    position: absolute;
    top: 59%;
    left: 50%;
    width: max(720px, 200vw);
    aspect-ratio: 1000 / 522;
    translate: -50% -16.7%;
    transform-origin: 50% 70%;
    scale: var(--s);
    /* Розмиття — у частці ширини, як і саме серце: з порогом у пікселях
       на телефоні воно зʼїдало ложбинку. */
    filter: blur(4.5vw);
  }
  .core .heart {
    filter: blur(3.5vw);
  }
  /* На телефоні поле вводу нижче (заголовок у два рядки) — ложбинка теж,
     інакше «V» ховається за полем і серця не впізнати. */
  @media (width < 48rem) {
    .heart {
      top: 68%;
    }
  }

  /* Поява: тло підіймається знизу, далі розкриваються ядро й ореол;
     потім ледь дихає (40 с на цикл). Числа — з Lovable. */
  .glow-enter {
    animation: glow-enter 1.6s cubic-bezier(0.215, 0.61, 0.355, 1) both;
  }
  .layer {
    transform-origin: 50% 75%;
  }
  .core {
    animation: glow-core 1s cubic-bezier(0.165, 0.84, 0.44, 1) 0.1s backwards;
  }
  .halo {
    animation: glow-halo 1.3s cubic-bezier(0.165, 0.84, 0.44, 1) 0.3s backwards;
  }
  .glow-ambient {
    transform-origin: 50% 75%;
    will-change: transform;
    animation: glow-ambient 40s steps(100, jump-none) infinite;
  }
  @keyframes glow-enter {
    from {
      opacity: 0;
      transform: translateY(50vh);
    }
  }
  @keyframes glow-core {
    from {
      opacity: 0;
      transform: scale(0.72);
    }
  }
  @keyframes glow-halo {
    from {
      opacity: 0;
      transform: scale(0.86);
    }
  }
  @keyframes glow-ambient {
    0%,
    100% {
      transform: translate(0, 0) scale(1);
    }
    25% {
      transform: translate(2.4%, -1.6%) scale(1.09);
    }
    50% {
      transform: translate(-1.2%, 2%) scale(1.12);
    }
    75% {
      transform: translate(-2.8%, -0.8%) scale(1.06);
    }
  }

  /* Зерно, як на банерах Lovable: дрібний сірий шум у режимі overlay.
     Overlay не чіпає ні білого, ні чорного — зерно видно лише на кольорі
     тла, а не на сторінці довкола й не на білому полі вводу. Тому шар
     стоїть ПОЗА .glow: маска робить .glow ізольованою групою, і всередині
     неї шум змішувався б із прозорим — тобто лягав би сірим по білому.
     Текст і поле йдуть у розмітці після тла, тож зерно лежить під ними. */
  .grain {
    position: absolute;
    inset: 0;
    pointer-events: none;
    mix-blend-mode: overlay;
    opacity: 0.55;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n' color-interpolation-filters='sRGB'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='1.6 0 0 0 -0.3 1.6 0 0 0 -0.3 1.6 0 0 0 -0.3 0 0 0 0 1'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    /* У темній темі overlay трохи видно й на темній сторінці — тримаємо
       зерно там, де тло. */
    mask-image: linear-gradient(to bottom, transparent 25%, #000 50%, #000 80%, transparent 100%);
    animation: grain-in 1.6s ease-out both;
  }
  @keyframes grain-in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .glow-enter,
    .core,
    .halo,
    .glow-ambient,
    .grain {
      animation: none;
    }
  }
</style>
