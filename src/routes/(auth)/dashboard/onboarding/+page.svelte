<script lang="ts">
  // Роутер онбордингу: вибір ролі → перехід на окремий роут.
  // Роль живе в URL, а не в $state: перезавантаження не скидає вибір,
  // працює кнопка «назад», форму можна відкрити прямим лінком.
  import { UserRound, Hammer, ChevronRight, BrushCleaning } from 'lucide-svelte'
</script>

<svelte:head><title>Ласкаво просимо · Zunor</title></svelte:head>

<div
  class="mx-auto flex min-h-[80vh] w-full max-w-md flex-col justify-center px-4 py-10"
>
  <h1 class="mb-10 text-center text-3xl font-semibold tracking-[-0.02em]">
    Оберіть дію
  </h1>

  <div class="flex flex-col gap-2.5">
    <a
      href="/dashboard/onboarding/client"
      class="card-tile group flex items-center gap-4 rounded-2xl border-[1.5px] border-border bg-card p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span
        class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors duration-200 group-hover:text-foreground"
      >
        <UserRound size={22} strokeWidth={1.75} aria-hidden="true" />
      </span>

      <span class="min-w-0 flex-1 font-medium">Замовити послугу</span>

      <ChevronRight
        size={18}
        strokeWidth={1.75}
        aria-hidden="true"
        class="shrink-0 text-muted-foreground/60"
      />
    </a>

    <a
      href="/dashboard/onboarding/master"
      class="card-tile group flex items-center gap-4 rounded-2xl border-[1.5px] border-border bg-card p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span
        class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors duration-200 group-hover:text-foreground"
      >
        <BrushCleaning size={22} strokeWidth={1.75} aria-hidden="true" />
      </span>

      <span class="min-w-0 flex-1 font-medium">Почати заробляти</span>

      <ChevronRight
        size={18}
        strokeWidth={1.75}
        aria-hidden="true"
        class="shrink-0 text-muted-foreground/60"
      />
    </a>
  </div>
</div>

<style>
  /* Ховер-стан картки.
     translateZ(0) + will-change виносять картку на окремий шар GPU.
     Без цього браузер перемальовує вміст на кожному кадрі масштабування,
     іконки й текст потрапляють на дробові пікселі — саме звідси дрижання.
     З шаром картка растеризується один раз і масштабується цілком. */
  .card-tile {
    transform: scale(1) translateZ(0);
    will-change: transform;
    backface-visibility: hidden;
    transition:
      transform 260ms cubic-bezier(0.32, 0.72, 0, 1),
      background-color 260ms ease-out,
      border-color 260ms ease-out;
  }

  .card-tile:hover {
    /* 1.2% замість 1.5%: на широкій картці різниця в русі майже
       непомітна, а дрібних артефактів по краях менше. */
    transform: scale(1.012) translateZ(0);
    background-color: color-mix(in oklab, var(--accent) 60%, transparent);
    border-color: color-mix(in oklab, var(--foreground) 15%, transparent);
  }

  .card-tile:active {
    transform: scale(0.996) translateZ(0);
    transition-duration: 100ms;
  }

  /* Вміст успадковує згладжування шару — прибирає «плавання» тексту
     на субпіксельних позиціях під час анімації. */
  .card-tile > :global(*) {
    transform: translateZ(0);
  }

  @media (prefers-reduced-motion: reduce) {
    .card-tile,
    .card-tile:hover,
    .card-tile:active {
      transform: none;
      will-change: auto;
      transition:
        background-color 200ms ease-out,
        border-color 200ms ease-out;
    }
  }
</style>
