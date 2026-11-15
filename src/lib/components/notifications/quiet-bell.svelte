<!--
  Порожня стрічка сповіщень — як у мобільному застосунку
  (mobile/src/components/notifications/quiet-bell.tsx, власник): сіра
  плитка (не акцент) із зафарбованим дзвіночком. При появі дзвіночок раз
  тихо гойднеться від верхівки, а від плитки повільно розходиться ледь
  помітна сіра хвиля її ж форми — «чекаємо». Хвиля проявляється й гасне
  плавно, без пружин. Із «Зменшити рух» — нерухомо, без хвилі.

  Ті самі числа, що в застосунку: плитка 72 зі скругленням 22, дзвіночок
  32, гойдання −12° → 9° → −5° → 2° → 0° за 0,8 с після паузи 0,45 с,
  хвиля до ×1,45 за 3,2 с, без кінця.
-->
<div class="quiet-bell" aria-hidden="true">
  <span class="wave"></span>
  <span class="tile">
    <svg class="bell" viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M19.2311 18H4.76887C3.79195 18 3 17.208 3 16.2311C3 15.762 3.18636 15.3121 3.51809 14.9803L4.12132 14.3771C4.68393 13.8145 5 13.0514 5 12.2558V9.5C5 5.63401 8.13401 2.5 12 2.5C15.866 2.5 19 5.634 19 9.5V12.2558C19 13.0514 19.3161 13.8145 19.8787 14.3771L20.4819 14.9803C20.8136 15.3121 21 15.762 21 16.2311C21 17.208 20.208 18 19.2311 18Z"
      />
      <path d="M9.2 19.4h5.6a2.8 2.8 0 0 1-5.6 0Z" />
    </svg>
  </span>
</div>

<style>
  .quiet-bell {
    position: relative;
    width: 72px;
    height: 72px;
    flex-shrink: 0;
  }

  .tile,
  .wave {
    position: absolute;
    inset: 0;
    border-radius: 22px;
  }

  .tile {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--shell);
  }

  /* Хвиля: прозора на старті, за мить — видима, далі розходиться до
     ×1,45 і гасне (як `interpolate(wave, [0, 0.12, 1], [0, 1, 0])` у
     застосунку, хвиля там — ease-out quad). */
  .wave {
    border: 1px solid
      color-mix(in srgb, var(--muted-foreground) 35%, transparent);
    opacity: 0;
    animation: quiet-wave 3200ms linear 600ms infinite;
  }

  .bell {
    width: 32px;
    height: 32px;
    color: var(--muted-foreground);
    /* Гойдається від верхівки, як справжній дзвоник. */
    transform-origin: 50% 12%;
    animation: quiet-swing 800ms 450ms both;
  }

  @keyframes quiet-swing {
    0% {
      rotate: 0deg;
      animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1);
    }
    18.75% {
      rotate: -12deg;
      animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1);
    }
    42.5% {
      rotate: 9deg;
      animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1);
    }
    63.75% {
      rotate: -5deg;
      animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1);
    }
    82.5% {
      rotate: 2deg;
      animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1);
    }
    100% {
      rotate: 0deg;
    }
  }

  /* Кадри — з ease-out quad (w = 1 − (1 − t)²): прозорість іде за w
     лінійно від 1 при w = 0,12 до 0, масштаб — 1 + 0,45·w. */
  @keyframes quiet-wave {
    0% {
      opacity: 0;
      scale: 1;
    }
    6.2% {
      opacity: 1;
      scale: 1.054;
    }
    20% {
      opacity: 0.73;
      scale: 1.162;
    }
    40% {
      opacity: 0.41;
      scale: 1.288;
    }
    60% {
      opacity: 0.18;
      scale: 1.378;
    }
    80% {
      opacity: 0.05;
      scale: 1.432;
    }
    100% {
      opacity: 0;
      scale: 1.45;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bell {
      animation: none;
    }
    .wave {
      display: none;
    }
  }
</style>
