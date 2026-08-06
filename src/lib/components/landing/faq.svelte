<script lang="ts">
  import * as Accordion from '$lib/components/ui/accordion/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { goto } from '$app/navigation'

  interface QA {
    id: string
    question: string
    answer: string
  }

  // Питання — те, що людина справді думає перед першим замовленням.
  // Відповіді короткі й конкретні: без «ми прагнемо» й «зазвичай».
  const FAQ: readonly QA[] = [
    {
      id: 'what',
      question: 'Що таке Zunor?',
      answer:
        'AI-асистент, який знаходить вам виконавця. Ви описуєте завдання своїми словами — Zunor оформлює заявку й розсилає її клінерам Одеси. Вам лишається обрати з пропозицій.',
    },
    {
      id: 'price',
      question: 'Скільки коштує прибирання?',
      answer:
        'Ціну називає кожен виконавець сам під вашу заявку. Ви бачите кілька пропозицій із сумою та часом і порівнюєте. Не влаштувало — можна нікого не обирати.',
    },
    {
      id: 'fee',
      question: 'Скільки бере Zunor?',
      answer:
        'З клієнта — нічого. Ви платите виконавцю ту суму, яку він назвав у пропозиції.',
    },
    {
      id: 'who',
      question: 'Хто приїде прибирати?',
      answer:
        'Приватні клінери й невеликі бригади з Одеси. До того як обрати, ви бачите ім’я, рейтинг, відгуки та фото робіт у профілі.',
    },

    {
      id: 'bad',
      question: 'А якщо прибрали погано?',
      answer:
        'Спершу напишіть виконавцю в чат — більшість питань вирішується там. Якщо ні — напишіть нам, ми бачимо листування щодо замовлення. Відгук теж лишається за вами.',
    },
    {
      id: 'supplies',
      question: 'Потрібні свої засоби та інвентар?',
      answer:
        'У кожного виконавця по-різному: одні приїжджають зі своїм, іншим зручніше вашим. Запитайте в чаті до підтвердження — це питання ставлять майже всі.',
    },
    {
      id: 'speed',
      question: 'Скільки чекати на пропозиції?',
      answer:
        'Заявка йде виконавцям одразу. Час до першого відгуку залежить від того, скільки клінерів зараз вільні. Сервіс новий, тож іноді доведеться зачекати довше.',
    },
    {
      id: 'cancel',
      question: 'Можна скасувати заявку?',
      answer:
        'Поки не обрали виконавця — просто закрийте її в кабінеті. Якщо замовлення вже підтверджене, попередьте виконавця в чаті: він забронював під вас час.',
    },
  ]
</script>

<section
  aria-labelledby="faq-heading"
  class="px-[clamp(20px,5vw,56px)] py-[clamp(48px,6vw,80px)] text-foreground"
>
  <div class="mx-auto max-w-[720px]">
    <header class="mx-auto mb-[clamp(32px,4vw,52px)] text-center">
      <p
        class="mb-3 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase"
      >
        Питання
      </p>
      <h2
        id="faq-heading"
        class="text-[clamp(1.7rem,3.2vw,2.4rem)] leading-[1.08] font-semibold tracking-[-0.03em] text-balance"
      >
        Часті питання
      </h2>
    </header>

    <!-- type="single" — відкрита лише одна відповідь: не губиться
         серед сусідніх розгорнутих блоків. -->
    <Accordion.Root type="single" class="w-full">
      {#each FAQ as item (item.id)}
        <Accordion.Item value={item.id} class="border-b border-border">
          <Accordion.Trigger
            class="py-5 text-start text-[15px] font-medium tracking-[-0.01em] hover:no-underline"
          >
            {item.question}
          </Accordion.Trigger>
          <Accordion.Content
            class="pb-5 text-[13.5px] leading-relaxed text-muted-foreground"
          >
            {item.answer}
          </Accordion.Content>
        </Accordion.Item>
      {/each}
    </Accordion.Root>

    <div class="mt-10 flex flex-col items-center gap-3 text-center">
      <Button class="px-7 py-6" onclick={() => goto('/user/register')}>
        Замовити прибирання
      </Button>
      <p class="text-[13px] text-muted-foreground">
        Заявка безкоштовна — ви нічого не платите, поки не оберете виконавця.
      </p>
    </div>
  </div>
</section>
