<script lang="ts">
  import { Search, Shield, Zap, ArrowRight } from 'lucide-svelte'

  const steps = [
    {
      icon: Search,
      step: '01',
      title: 'Створіть замовлення',
      desc: 'Детально опишіть, що і коли потрібно зробити',
    },
    {
      icon: Shield,
      step: '02',
      title: 'Фахівець отримає завдання',
      desc: 'І зв‘яжеться з вами для обговорення деталей',
    },
    {
      icon: Zap,
      step: '03',
      title: 'Закрийте замовлення',
      desc: 'Залиште відгук та оцінку за виконану роботу',
    },
  ]
</script>

<section class="py-24 border-t" style="background-color: var(--background); border-color: var(--border)">
  <div class="max-w-6xl mx-auto px-6">
    
    <!-- Заголовок в стиле Uber: огромный, жирный, с акцентной линией -->
    <div class="mb-20">
      <h2 class="text-4xl md:text-6xl font-bold tracking-tighter mb-8" style="color: var(--foreground)">
        Як це працює
      </h2>
      <!-- Та самая Uber-линия -->
      <div class="h-1.5 w-24" style="background-color: var(--primary)"></div>
    </div>

    <!-- Сетка без карточек — только чистый контент и воздух -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-12">
      {#each steps as step}
        <div class="group flex flex-col items-start">
          
          <!-- Номер шага: маленький, но жирный -->
          <span class="text-sm font-black mb-6 opacity-40 tracking-widest" style="color: var(--foreground)">
            {step.step} —
          </span>

          <!-- Иконка: большая, тонкая (stroke 1.0) -->
          <div class="mb-10 transition-transform duration-500 group-hover:scale-110 group-hover:translate-x-2">
            <step.icon size={60} strokeWidth={1} style="color: var(--foreground)" />
          </div>

          <!-- Текст -->
          <div class="space-y-4">
            <h3 class="text-2xl font-bold tracking-tight" style="color: var(--foreground)">
              {step.title}
            </h3>
            <p class="text-[17px] leading-relaxed opacity-60 max-w-[280px]" style="color: var(--foreground)">
              {step.desc}
            </p>
          </div>

          <!-- Интерактивный элемент (по желанию) -->
          <div class="mt-8 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
            <span class="text-xs font-bold uppercase tracking-wider">Почати</span>
            <ArrowRight size={14} />
          </div>
        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  /* Uber стиль строится на шрифтах без засечек и больших отступах */
  section {
    font-family: 'Inter', -apple-system, sans-serif;
  }

  /* Тонкая настройка для темного режима */
  :global(.dark) section {
    border-top-width: 1px;
    border-color: rgba(255, 255, 255, 0.05);
  }
</style>