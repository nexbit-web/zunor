<script lang="ts">
  const steps = [
    {
      number: '1',
      title: 'Опиши задачу',
      text: 'За 4 кроки, без зайвих питань. Жодних анкет.',
    },
    {
      number: '2',
      title: 'Отримай відгуки',
      text: 'Клінери поруч відповідають за хвилини. Ціна — у відгуку.',
    },
    {
      number: '3',
      title: 'Обери свого',
      text: 'Дивишся на профілі, читаєш відгуки, домовляєшся в чаті.',
    },
  ]
</script>

<section class="px-4 sm:px-6 lg:px-8 py-16 sm:py-20 bg-secondary/30">
  <div class="max-w-5xl mx-auto">
    <h2
      class="text-3xl sm:text-4xl font-bold tracking-tight text-foreground text-center mb-12"
    >
      Як це працює
    </h2>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-12">
      {#each steps as step (step.number)}
        <div class="flex flex-col items-start">
          <div
            class="flex items-center justify-center w-12 h-12 rounded-full bg-foreground text-background text-lg font-bold mb-4"
          >
            {step.number}
          </div>
          <h3 class="text-xl font-semibold tracking-tight text-foreground mb-2">
            {step.title}
          </h3>
          <p class="text-base text-muted-foreground leading-relaxed">
            {step.text}
          </p>
        </div>
      {/each}
    </div>
  </div>
</section>
