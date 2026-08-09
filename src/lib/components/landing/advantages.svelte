<script lang="ts">
  import { Check, X } from 'lucide-svelte'

  // full — є; partial — є, але з застереженням; none — немає.
  type Support = 'full' | 'partial' | 'none'

  interface Row {
    label: string
    /** Порядок збігається з COLUMNS. */
    values: readonly [Support, Support, Support, Support]
  }

  const COLUMNS = [
    'Zunor',
    'Дошки оголошень',
    'Клінінгові компанії',
    'За рекомендацією',
  ] as const

  // Порівняння чесне: у компаній кілька «так», у знайомих теж.
  // Таблиця, де в конкурентів самі хрестики, викликає недовіру,
  // а не бажання замовити.
  const ROWS: readonly Row[] = [
    {
      label: 'Майстри пишуть самі',
      values: ['full', 'none', 'none', 'none'],
    },
    {
      label: 'Кілька цін під одне завдання',
      values: ['full', 'none', 'none', 'none'],
    },
    {
      label: 'AI оформлює заявку замість вас',
      values: ['full', 'none', 'none', 'none'],
    },
    {
      label: 'Пропозиції можна порівняти поруч',
      values: ['full', 'none', 'none', 'none'],
    },
    {
      label: 'Ціна відома до приїзду',
      values: ['full', 'partial', 'full', 'none'],
    },
    {
      label: 'Відгуки про конкретного виконавця',
      values: ['full', 'partial', 'none', 'none'],
    },
  ]

  const LABELS: Record<Support, string> = {
    full: 'так',
    partial: 'частково',
    none: 'ні',
  }
</script>

<section
  aria-labelledby="advantages-heading"
  class="px-[clamp(20px,5vw,56px)] py-[clamp(48px,6vw,80px)] text-foreground"
>
  <div class="mx-auto max-w-[1120px]">
    <header class="mx-auto mb-[clamp(32px,4vw,52px)] max-w-[38rem] text-center">
      <p
        class="mb-3 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase"
      >
        Переваги
      </p>
      <h2
        id="advantages-heading"
        class="text-[clamp(1.7rem,3.2vw,2.4rem)] leading-[1.08] font-semibold tracking-[-0.03em] text-balance"
      >
        Чому обирають Zunor
      </h2>
      <p
        class="mt-4 text-[15px] leading-relaxed text-pretty text-muted-foreground"
      >
        Клінера шукають на дошках, у клінінгових компаніях або питають знайомих.
        Ось що дає кожен зі способів.
      </p>
    </header>

    <!-- Прокручуваний регіон має бути досяжним з клавіатури, тому tabindex
         на неінтерактивному div тут навмисний; ім'я йому дає aria-label. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="mx-auto max-w-[920px] overflow-x-auto rounded-[20px] border border-border"
      role="region"
      aria-label="Таблиця порівняння"
      tabindex="0"
    >
      <table class="w-full min-w-[720px] border-collapse text-left">
        <caption class="sr-only">
          Порівняння Zunor із дошками оголошень, клінінговими компаніями та
          пошуком за рекомендацією
        </caption>

        <thead>
          <tr>
            <th scope="col" class="w-[38%] bg-muted/30 px-6 py-5"></th>

            {#each COLUMNS as col, i (col)}
              <th
                scope="col"
                class="px-4 py-5 text-center text-[13.5px] font-medium whitespace-nowrap {i ===
                0
                  ? 'bg-foreground text-background'
                  : 'bg-muted/30 text-muted-foreground'}"
              >
                {col}
              </th>
            {/each}
          </tr>
        </thead>

        <tbody>
          {#each ROWS as row (row.label)}
            <tr class="border-t border-border">
              <th
                scope="row"
                class="px-6 py-4 text-[13.5px] font-normal text-foreground"
              >
                {row.label}
              </th>

              {#each row.values as value, i (i)}
                <td
                  class="px-4 py-4 text-center {i === 0 ? 'bg-muted/25' : ''}"
                >
                  <span
                    class="inline-flex size-6 items-center justify-center rounded-full {value ===
                    'full'
                      ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                      : value === 'partial'
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-red-500/10 text-red-500 dark:text-red-400'}"
                  >
                    {#if value === 'none'}
                      <X size={13} strokeWidth={2.5} aria-hidden="true" />
                    {:else}
                      <Check size={13} strokeWidth={2.5} aria-hidden="true" />
                    {/if}
                    <!-- Іконка сама по собі нічого не каже скрінрідеру,
                         тож дублюємо стан текстом. -->
                    <span class="sr-only">{LABELS[value]}</span>
                  </span>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Пряма згадка про те, що платформа нова: знімає питання
         «а чому тут так мало виконавців» до того, як воно виникне. -->
    <p
      class="mx-auto mt-8 max-w-[40rem] text-center text-[13px] leading-relaxed text-muted-foreground"
    >
      Zunor щойно запрацював в Одесі. Виконавців поки небагато, зате кожну
      анкету ми переглядаємо вручну.
    </p>
  </div>
</section>
