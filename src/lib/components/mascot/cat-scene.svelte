<script lang="ts" module>
  /**
   * Сцени кота — ті самі анімації, що в мобільному застосунку
   * (mobile/assets/animations, збирає mobile/scripts/mascot/build.mjs;
   * сюди — копії в static/animations). w×h — полотно сцени, width —
   * найбільша ширина на екрані. Нижче її стискає ще й висота вікна (див.
   * розмітку): заставка з котом, хмаринкою й текстом мусить вміщатись в
   * один екран без прокрутки (власник).
   */
  const SCENES = {
    /** «Познайомимось»: сидить, усміхається, каже. */
    hello: {
      src: '/animations/cat-hello.json',
      w: 740,
      h: 690,
      width: 220,
      bubble: 'speech',
    },
    /** «Яку роботу берете»: лапка під підборіддям, відро чи пульверизатор? */
    think: {
      src: '/animations/cat-think.json',
      w: 1070,
      h: 690,
      width: 318,
      bubble: 'thought',
    },
    /** «Покажіть себе клієнтам»: показує свій профіль на планшеті. */
    show: {
      src: '/animations/cat-show.json',
      w: 740,
      h: 690,
      width: 220,
      bubble: 'speech',
    },
  } as const

  export type CatSceneName = keyof typeof SCENES
</script>

<script lang="ts">
  // Рудий кіт-талісман на заставці етапу анкети — як CatScene у
  // мобільному застосунку (mobile/src/components/mascot/cat-scene.tsx,
  // власник): кіт по центру, над ним хмаринка з `say`. Кіт живий, але
  // спокійно: дихає, кліпає, хилить голову — рівно, без пружин. Хмаринка
  // «вилазить» трохи згодом: проявляється й підростає від хвостика.
  // `speech` — хвостик-трикутник (каже), `thought` — кружечки (думає).
  // «Зменшити рух» — кіт стоїть на першому кадрі, хмаринка одразу.
  //
  // Уся сцена — прикраса (aria-hidden): що сказано в хмаринці, читачу
  // екрана каже заголовок етапу поруч.
  import { prefersReducedMotion } from 'svelte/motion'
  import { lottie } from '$lib/utils/lottie'

  let { scene, say }: { scene: CatSceneName; say?: string } = $props()

  const def = $derived(SCENES[scene])
</script>

<div class="cat-scene" aria-hidden="true">
  {#if say}
    <div class="bubble-wrap">
      <div class="bubble" class:thought={def.bubble === 'thought'}>
        {say}
      </div>
      {#if def.bubble === 'speech'}
        <!-- Хвостик: заливка закриває рамку хмаринки там, де він виходить. -->
        <svg class="tail" width="30" height="17" viewBox="0 0 30 17">
          <path
            d="M2 0 L15 14 L28 0"
            fill="#ffffff"
            stroke="#380c1e"
            stroke-width="3"
            stroke-linejoin="round"
          />
        </svg>
      {:else}
        <!-- Думка: два кружечки від голови до хмаринки. -->
        <span class="dots">
          <span class="dot dot-big"></span>
          <span class="dot dot-small"></span>
        </span>
      {/if}
    </div>
  {/if}

  <div
    class="cat"
    class:after-bubble={!!say}
    style:width="min({def.width}px, 100%, calc(26svh * {def.w} / {def.h}))"
    style:aspect-ratio="{def.w} / {def.h}"
    {@attach lottie({
      src: def.src,
      autoplay: !prefersReducedMotion.current,
    })}
  ></div>
</div>

<style>
  /* Хмаринка — частина малюнка-наліпки, а не інтерфейсу: біла з
     контуром кольору контуру кота в обох темах (тому не токени теми). */
  .cat-scene {
    --ink: #380c1e;
    --paper: #ffffff;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .bubble-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    transform-origin: bottom center;
    animation: bubble-in 380ms cubic-bezier(0.33, 1, 0.68, 1) 350ms both;
  }

  .bubble {
    padding: 11px 22px;
    border: 3px solid var(--ink);
    border-radius: 22px;
    background: var(--paper);
    color: var(--ink);
    font-size: 22px;
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: -0.3px;
    text-align: center;
  }

  .bubble.thought {
    border-radius: 28px;
  }

  .tail {
    display: block;
    margin-top: -3px;
  }

  .dots {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 30px;
  }

  .dot {
    display: block;
    border: 2.5px solid var(--ink);
    border-radius: 9999px;
    background: var(--paper);
  }

  .dot-big {
    width: 15px;
    height: 15px;
    margin-top: 4px;
    margin-left: -14px;
  }

  .dot-small {
    width: 10px;
    height: 10px;
    margin-top: 2px;
    margin-left: -30px;
  }

  .cat.after-bubble {
    margin-top: -4px;
  }

  @keyframes bubble-in {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.6);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bubble-wrap {
      animation: none;
    }
  }
</style>
