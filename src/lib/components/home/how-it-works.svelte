<!--
  Секція «Як це працює» — Zunor.
  Чорно-білий преміум-мінімалізм, шрифт Onest (успадковується). Без акцентних кольорів.
  Стилі — Tailwind v4 на семантичних токенах (підтримує тему). Без обіцянок щодо часу.
  Залежності: lucide-svelte.
-->
<script lang="ts">
  import { UserCheck } from 'lucide-svelte'
  import { MessagesSquare } from 'lucide-svelte'
  import { PenLine } from 'lucide-svelte'

  const steps = [
    {
      icon: PenLine,
      title: 'Опишіть задачу',
      text: 'Вкажіть тип прибирання, площу та зручний час. Кілька полів — без анкет і дзвінків.',
    },
    {
      icon: MessagesSquare,
      title: 'Порівняйте відгуки',
      text: 'Виконавці надсилають пропозиції з вартістю. Ви бачите рейтинг і реальні відгуки.',
    },
    {
      icon: UserCheck,
      title: 'Оберіть виконавця',
      text: 'Узгодьте деталі в чаті та підтвердьте замовлення. Оплата — після виконаної роботи.',
    },
  ]
</script>

<section
  class="px-[clamp(20px,5vw,56px)]   text-foreground"
>
  <div class="mx-auto max-w-270">
    <!-- Заголовок -->
    <header class="mb-[clamp(48px,6vw,80px)] max-w-150">
      <p
        class="mb-5 inline-flex items-center gap-2.5 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase"
      >
        <span class="h-px w-6 bg-foreground" aria-hidden="true"></span>
        Як це працює?
      </p>
      <h2
        class="mb-4 text-[clamp(30px,4vw,46px)] leading-[1.06] font-bold tracking-[-0.035em] text-balance"
      >
        Три кроки до чистого дому
      </h2>
    </header>

    <!-- Кроки -->
    <ol class="grid grid-cols-1 min-[820px]:grid-cols-3">
      {#each steps as step, i (step.title)}
        <li
          class="relative border-t border-border pt-8 first:border-t-0 first:pt-0 min-[820px]:border-t-0 min-[820px]:border-l min-[820px]:px-9 min-[820px]:pt-0 min-[820px]:first:border-l-0 min-[820px]:first:pl-0 min-[820px]:last:pr-0"
        >
          <span
            class="mb-7 block text-[13px] font-semibold tracking-[0.04em] text-muted-foreground tabular-nums"
            aria-hidden="true"
          >
            <span class="text-foreground">{String(i + 1).padStart(2, '0')}</span
            >
            &nbsp;/&nbsp; 0{steps.length}
          </span>

          <div class="mb-5 text-foreground">
            <step.icon size={26} strokeWidth={1.6} aria-hidden="true" />
          </div>

          <h3 class="mb-2.5 text-xl font-semibold tracking-[-0.02em]">
            {step.title}
          </h3>
          <p
            class="text-[15.5px] leading-[1.6] text-pretty text-muted-foreground"
          >
            {step.text}
          </p>
        </li>
      {/each}
    </ol>
  </div>
</section>
