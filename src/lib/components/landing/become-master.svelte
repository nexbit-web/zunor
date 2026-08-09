<script lang="ts">
  import { ArrowRight } from 'lucide-svelte'

  interface Props {
    href?: string
    learnMoreHref?: string
  }

  let { href = '/user/register', learnMoreHref = '/master/about' }: Props =
    $props()
</script>

<section
  class="px-[clamp(20px,5vw,56px)] py-[clamp(32px,4vw,56px)]"
  aria-labelledby="become-master-title"
>
  <div
    class="relative isolate mx-auto max-w-[1120px] overflow-hidden rounded-[24px] bg-[#1c1a18] px-[clamp(28px,5vw,72px)] py-[clamp(44px,6vw,80px)]"
  >
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_70%_at_50%_0%,rgba(198,124,88,0.3),transparent_70%)] sm:bg-[radial-gradient(ellipse_45%_75%_at_78%_50%,rgba(198,124,88,0.32),transparent_70%)]"
    ></div>

    <div class="max-w-[38rem]">
      <h2
        id="become-master-title"
        class="font-serif text-[clamp(2rem,5vw,3.25rem)] leading-[1.08] font-normal tracking-[-0.02em] text-balance text-white"
      >
        Прибираєте професійно?<br class="hidden sm:block" />
        Отримуйте замовлення
      </h2>

      <p
        class="mt-5 max-w-[34rem] text-[clamp(0.9375rem,1.6vw,1.0625rem)] leading-relaxed text-pretty text-white/65"
      >
        Zunor приводить клієнтів — ви обираєте, що і коли виконувати.
      </p>

      <div class="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
        <a
          {href}
          class="group inline-flex items-center gap-2.5 rounded-xl bg-white px-7 py-3.5 text-[15px] font-medium text-[#1c1a18] transition-colors duration-200 hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white"
        >
          Стати майстром
          <ArrowRight
            size={16}
            strokeWidth={2}
            aria-hidden="true"
            class="transition-transform duration-200 ease-out group-hover:translate-x-0.5"
          />
        </a>

        <a
          href={learnMoreHref}
          class="rounded-sm text-[15px] font-medium text-white/70 underline-offset-4 transition-colors duration-200 hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white"
        >
          Дізнатися більше
        </a>
      </div>
    </div>
  </div>
</section>
