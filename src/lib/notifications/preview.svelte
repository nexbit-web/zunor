<!--
  Перевірка вигляду сповіщень — кнопка в правому нижньому куті головної
  дашборда, ЛИШЕ в режимі розробки (сторінка вмикає її за `dev`, тож у
  продакшн-збірку вона не потрапляє). Кожен пункт показує справжню картку
  через той самий showNotificationToast, що й подія з Pusher, — тобто
  перевіряється рівно те, що побачить користувач, а не макет.

  Тексти — ті самі, що пише сервер ($lib/server/notifications.ts). Імпорт
  звідти неможливий (модуль тягне Prisma), тож тут копія: міняєш текст
  на сервері — онови й тут, інакше перевірятимеш не те.

  Адрес у прикладах немає (ні jobId, ні orderId), тому дія веде в
  стрічку сповіщень, а не на неіснуючу заявку.
-->
<script lang="ts">
  import BellRingIcon from '$lib/components/icons/set/bell-ring.svelte'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { buttonVariants } from '$lib/components/ui/button'
  import { showNotificationToast } from './toast'
  import type { Notification } from './types'

  interface Sample {
    /** Назва пункту в меню. */
    name: string
    /** Хто отримує таке сповіщення. */
    to: string
    n: Pick<Notification, 'type' | 'title' | 'body'>
  }

  const SAMPLES: Sample[] = [
    {
      name: 'Нова заявка',
      to: 'майстру',
      n: {
        type: 'NEW_JOB',
        title: 'Є нова заявка для тебе',
        body: 'Генеральне прибирання квартири, 54 м² · Аркадія',
      },
    },
    {
      name: 'Заявка далі за радіус',
      to: 'майстру',
      n: {
        type: 'NEW_JOB',
        title: 'Можливо, тобі буде цікава ця заявка',
        body:
          'Миття вікон після ремонту. Це 7 км — далі, ніж ти зазвичай ' +
          'їздиш, але поруч поки немає вільних майстрів. Не підходить — ' +
          'просто пропусти, на рейтинг це не вплине.',
      },
    },
    {
      name: 'Новий відгук',
      to: 'клієнту',
      n: { type: 'NEW_PROPOSAL', title: 'Майстер відгукнувся на твою заявку!' },
    },
    {
      name: 'Майстра обрано',
      to: 'майстру',
      n: {
        type: 'PROPOSAL_ACCEPTED',
        title: 'Вітаю, тебе обрали!',
        body: 'Можеш починати роботу',
      },
    },
    {
      name: 'Робота почалась',
      to: 'клієнту',
      n: { type: 'ORDER_STARTED', title: 'Майстер узявся за роботу' },
    },
    {
      name: 'Роботу завершено',
      to: 'клієнту',
      n: {
        type: 'ORDER_COMPLETED',
        title: 'Роботу завершено!',
        body: 'Залиш відгук про майстра',
      },
    },
    {
      name: 'Замовлення скасовано',
      to: 'обом',
      n: {
        type: 'ORDER_CANCELLED',
        title: 'Замовлення скасовано',
        body: 'Змінились плани — прибирання вже не потрібне',
      },
    },
    {
      name: 'Майстер відмовився',
      to: 'клієнту',
      n: {
        type: 'JOB_REOPENED',
        title: 'Майстер відмовився, але я вже шукаю нового.',
        body: 'Скоро зʼявляться нові відгуки — я повідомлю.',
      },
    },
    {
      name: 'Невідомий тип',
      to: 'загальний вигляд',
      n: { type: 'SOMETHING_NEW', title: 'Щось нове в Zunor' },
    },
  ]

  // Свій id кожному показу: з однаковим бібліотека замінила б картку, а
  // не поставила нову, і стос не перевірити.
  let seq = 0

  function show(s: Sample): void {
    seq += 1
    showNotificationToast({
      id: `preview-${seq}`,
      isRead: false,
      createdAt: new Date().toISOString(),
      ...s.n,
    })
  }

  /** Пачка за раз — на екрані мусять лишитись лише найновіші (toast.ts). */
  function showBurst(): void {
    SAMPLES.slice(0, 6).forEach((s, i) => setTimeout(() => show(s), i * 300))
  }
</script>

<div class="fixed right-4 bottom-4 z-40">
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      class={buttonVariants({
        variant: 'outline',
        class: 'rounded-full shadow-md',
      })}
    >
      <BellRingIcon />
      Сповіщення
    </DropdownMenu.Trigger>
    <DropdownMenu.Content side="top" align="end" class="w-64">
      <DropdownMenu.Label class="text-xs text-muted-foreground">
        Перевірка сповіщень · лише dev
      </DropdownMenu.Label>
      {#each SAMPLES as s (s.name)}
        <DropdownMenu.Item onSelect={() => show(s)}>
          <span class="flex-1">{s.name}</span>
          <span class="text-xs text-muted-foreground">{s.to}</span>
        </DropdownMenu.Item>
      {/each}
      <DropdownMenu.Separator />
      <DropdownMenu.Item onSelect={showBurst}>Шість поспіль</DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
</div>
