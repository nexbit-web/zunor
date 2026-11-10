<!--
  «Допомога» — відповіді на часті питання й звʼязок із підтримкою.

  Відповіді про те, як працює сервіс, — ті самі факти, що знає асистент
  (SERVICE_FACTS у $lib/server/zunor/prompt.ts): що клієнтові безкоштовно,
  як платити, коли видно телефон, де скасувати. Міняються разом — інакше
  сторінка й асистент казатимуть людям різне. Страховок і гарантій
  немає, і сторінка так і каже: обіцянка, якої немає в продукті, гірша за
  чесне «ні».

  Питання своєї ролі — першими: клієнтові «як обрати майстра», майстрові
  «як отримувати заявки». Чужі лишаються нижче — людина буває й тим, і
  іншим.
-->
<script lang="ts">
  import * as Accordion from '$lib/components/ui/accordion'
  import PageHead from '$lib/components/dashboard/page-head.svelte'
  import Mail from '$lib/components/icons/set/mail.svelte'
  import Send from '$lib/components/icons/set/send.svelte'
  import Flag from '$lib/components/icons/set/flag.svelte'
  import { COMPANY } from '$lib/legal/company-info'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  interface Faq {
    q: string
    a: string
  }

  const CLIENT_FAQ: Faq[] = [
    {
      q: 'Як знайти майстра?',
      a: 'Опишіть задачу в «Нове замовлення» — своїми словами в чаті з Zunor або короткою формою. Заявку одразу бачать майстри поруч, і ті, кому вона підходить, самі пропонують ціну.',
    },
    {
      q: 'Як обрати майстра?',
      a: 'Пропозиції приходять у «Мої заявки». У кожного майстра є профіль: відгуки інших клієнтів, рейтинг, приклади робіт і позначка верифікації — вона є не в кожного. Найкращих ми позначаємо, але обираєте ви.',
    },
    {
      q: 'Скільки коштує Zunor?',
      a: 'Для клієнта — безкоштовно. За роботу ви платите напряму майстру, спосіб оплати узгоджуєте з ним.',
    },
    {
      q: 'Коли я побачу телефон майстра?',
      a: 'Щойно оберете майстра: телефони одне одного ви обоє побачите в розділі «Замовлення». Адресу й деталі обговорюйте в чаті («Повідомлення»).',
    },
    {
      q: 'Як змінити заявку?',
      a: 'У «Мої заявки» відкрийте її й у меню ⋮ натисніть «Редагувати заявку»: можна змінити дату, деталі, фото й опис. Змінити можна, доки майстра не обрано. Майстри, що вже надіслали пропозицію, отримають сповіщення про зміни.',
    },
    {
      q: 'Як скасувати заявку чи замовлення?',
      a: 'Заявку — у «Мої заявки»: відкрийте її й у меню ⋮ натисніть «Скасувати заявку». Замовлення з уже обраним майстром — у «Замовлення», кнопка в блоці «Дії»; причину побачить майстер.',
    },
    {
      q: 'Майстер не прийшов або щось пішло не так',
      a: 'Поскаржтеся: кнопка «Поскаржитися» є на сторінці замовлення, у меню ⋮ чату та в профілі майстра. Скаргу розгляне модератор. Якщо майстер відмовився від замовлення, заявка сама повертається в пошук.',
    },
    {
      q: 'Чи є страховка чи гарантія?',
      a: 'Ні. Zunor допомагає знайти майстра й домовитися, а роботу виконує сам майстер. Тому дивіться на відгуки й верифікацію, а після роботи залиште свій відгук — він допоможе іншим.',
    },
  ]

  const MASTER_FAQ: Faq[] = [
    {
      q: 'Як отримувати заявки?',
      a: 'Нові заявки поруч приходять сповіщенням і зʼявляються в «Заявки поруч». Спершу їх бачать майстри найближче до клієнта, потім — далі. Дальність, на яку ви готові їздити, задається в профілі: заявки далі неї приходять, лише коли ближче нікого не знайшлося.',
    },
    {
      q: 'Чи платити за відгук на заявку?',
      a: 'Ні. Зараз Zunor безкоштовний і для майстрів: відгукуйтеся на скільки завгодно заявок.',
    },
    {
      q: 'У мене немає відгуків — чи є шанс?',
      a: 'Так. Новачки отримують заявки нарівні з усіма, а серед рекомендованих клієнтові майстрів одне місце завжди лишається для новачка. Клієнт бачить усіх, хто відгукнувся.',
    },
    {
      q: 'Що таке верифікація?',
      a: 'Позначка, що модератор перевірив вашу анкету. Вона дає перевагу в підборі й довіру клієнтів. Анкета йде на перевірку після кожного збереження профілю.',
    },
    {
      q: 'Коли я побачу телефон клієнта?',
      a: 'Коли клієнт обере вас: тоді ви обоє побачите телефони одне одного в розділі «Замовлення». До того — лише чат.',
    },
    {
      q: 'Клієнт поводиться некоректно',
      a: 'Поскаржтеся: кнопка «Поскаржитися» є на сторінці замовлення, у меню ⋮ чату, у профілі клієнта й у меню ⋮ заявки. Скаргу розгляне модератор.',
    },
  ]

  const ACCOUNT_FAQ: Faq[] = [
    {
      q: 'Як змінити пароль чи видалити акаунт?',
      a: '«Налаштування» → «Безпека». Видалення незворотне: профіль і дані стираються, а завершені замовлення й відгуки лишаються в інших під іменем «Видалений акаунт».',
    },
  ]

  const isMaster = $derived(data.role === 'MASTER')

  const sections = $derived(
    isMaster
      ? [
          { title: 'Для майстрів', items: MASTER_FAQ, id: 'master' },
          { title: 'Для клієнтів', items: CLIENT_FAQ, id: 'client' },
          { title: 'Акаунт', items: ACCOUNT_FAQ, id: 'account' },
        ]
      : [
          { title: 'Для клієнтів', items: CLIENT_FAQ, id: 'client' },
          { title: 'Для майстрів', items: MASTER_FAQ, id: 'master' },
          { title: 'Акаунт', items: ACCOUNT_FAQ, id: 'account' },
        ],
  )

  const CONTACT =
    'flex items-center gap-3 rounded-xl px-4 py-3.5 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
</script>

<svelte:head><title>Допомога · Zunor</title></svelte:head>

<div class="mx-auto w-full max-w-3xl px-4 pb-10 sm:px-6">
  <PageHead>
    <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Допомога</h1>
  </PageHead>

  <div class="mt-2 flex flex-col gap-8">
    {#each sections as s (s.id)}
      <section aria-labelledby="faq-{s.id}">
        <h2
          id="faq-{s.id}"
          class="mb-1 text-[13px] font-medium tracking-wide text-muted-foreground uppercase"
        >
          {s.title}
        </h2>
        <Accordion.Root type="single" class="rounded-xl bg-muted/40 px-4">
          {#each s.items as item, i (item.q)}
            <Accordion.Item
              value="{s.id}-{i}"
              class="border-t border-border/60 first:border-t-0"
            >
              <Accordion.Trigger
                class="py-3.5 text-[15px] font-medium hover:no-underline"
              >
                {item.q}
              </Accordion.Trigger>
              <Accordion.Content
                class="pb-4 text-[14.5px] leading-relaxed text-pretty text-muted-foreground"
              >
                {item.a}
              </Accordion.Content>
            </Accordion.Item>
          {/each}
        </Accordion.Root>
      </section>
    {/each}

    <section aria-labelledby="contact">
      <h2
        id="contact"
        class="mb-1 text-[13px] font-medium tracking-wide text-muted-foreground uppercase"
      >
        Не знайшли відповідь?
      </h2>
      <div class="flex flex-col gap-0.5 rounded-xl bg-muted/40 py-1">
        <a href="mailto:{COMPANY.supportEmail}" class={CONTACT}>
          <Mail class="size-5 shrink-0 text-muted-foreground" />
          <span class="min-w-0">
            <span class="block text-[15px] font-medium">Написати на пошту</span>
            <span class="block truncate text-[13px] text-muted-foreground">
              {COMPANY.supportEmail}
            </span>
          </span>
        </a>
        <a
          href={COMPANY.telegram}
          target="_blank"
          rel="noopener noreferrer"
          class={CONTACT}
        >
          <Send class="size-5 shrink-0 text-muted-foreground" />
          <span class="min-w-0">
            <span class="block text-[15px] font-medium">Telegram</span>
            <span class="block truncate text-[13px] text-muted-foreground">
              {COMPANY.telegram.replace('https://', '')}
            </span>
          </span>
        </a>
      </div>
      <p
        class="mt-3 flex items-start gap-2 px-1 text-[13px] leading-relaxed text-muted-foreground"
      >
        <Flag class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Скарга на конкретну людину швидше дійде через «Поскаржитися» — на
        сторінці замовлення, у меню чату чи в профілі: модератор одразу
        побачить, про кого й про що мова.
      </p>
    </section>
  </div>
</div>
