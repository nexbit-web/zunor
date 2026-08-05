# AGENTS.md — Zunor

Канонічні інструкції для **будь-якого** coding-агента, що працює в цьому
репозиторії (Claude Code, Codex, Cursor тощо). Якщо створюєш `CLAUDE.md` —
роби з нього лише покажчик на цей файл, редагуй AGENTS.md.

## Про проєкт

**Zunor** — сервіс замовлення прибирання в Україні (старт з Одеси), задуманий
як agentic-альтернатива каталогам на кшталт Kabanchik: клієнт описує задачу
чат-асистенту платформи, а не шукає виконавця в списку. Окремого
персонажа-помічника («Zuna») в продукті більше немає — асистент говорить від
імені самого Zunor. Повний контекст
продукту, філософія і причини кожного рішення — у `MANIFESTO.md`. **Прочитай
його перед будь-якою продуктовою (не суто технічною) зміною** — там пояснено,
чому речі зроблені саме так, і є явний чек-лист «5 уникальностей», яким
звіряється кожне рішення.

Мова коментарів у коді — переважно українська (місцями російська), мова
самого коду (ідентифікатори, типи) — англійська. Дотримуйся цього балансу,
не перекладай існуючі коментарі без потреби.

## Технологічний стек

| Шар            | Технологія                                        |
| -------------- | -------------------------------------------------- |
| Framework      | SvelteKit (Svelte 5, **runes mode** примусово)      |
| Мова           | TypeScript (`strict: true`)                        |
| Build          | Vite                                                |
| CSS            | Tailwind CSS 4 + shadcn-svelte (стиль `vega`)       |
| БД             | PostgreSQL через Prisma 7 (`@prisma/adapter-pg`)    |
| Auth           | better-auth (`src/lib/server/auth.ts`)              |
| Realtime       | Pusher Channels                                     |
| Файли/зображення | Cloudinary                                        |
| Пошта          | Nodemailer (SMTP)                                   |
| AI-чат-асистент| DeepSeek API (`src/lib/server/zunor/deepseek.ts`)   |
| Пакетний менеджер | npm                                              |

## Розробка

```
npm install
npm run dev          # dev-сервер, за замовчуванням :5173
npm run build        # продакшн-збірка
npm run preview      # прев'ю продакшн-збірки
npm run check        # svelte-kit sync + svelte-check (типи)
```

Лінтера (ESLint) і тестів (Vitest/etc.) у проєкті наразі **немає** — не вигадуй
`npm run lint` чи `npm run test`, їх не існує. Головна перевірка коректності —
`npm run check` (типи) плюс ручна перевірка в діалогах (див.
`docs/zunor-test-dialogs.md`).

### Змінні середовища

Копіюй `.env.example` → `.env` і заповнюй. Ніколи не комітити `.env`, не
підставляти реальні секрети в код чи приклади — дивись коментарі у самому
`.env.example`, там описано звідки брати кожен ключ (Supabase/Neon для БД,
Cloudinary dashboard, Pusher dashboard тощо).

### Prisma

Клієнт генерується **не** в `node_modules`, а в `src/generated/prisma`
(див. `generator client` у `prisma/schema.prisma`). Імпортувати звідти:

```ts
import { PrismaClient } from '../../generated/prisma/client' // з src/lib/server/*
import type { Role, OrderStatus } from '../../generated/prisma/client'
```

Після будь-якої зміни `schema.prisma` — прогнати міграцію
(`npx prisma migrate dev`), не редагувати `prisma/migrations/*` вручну.

## Структура каталогів

```
src/
├── routes/
│   ├── (auth)/dashboard/   # захищена зона (guard: сесія + роль)
│   ├── (auth)/user/        # логін/реєстрація/onboarding
│   ├── [handle=handle]/    # публічний профіль майстра за @handle
│   ├── api/                # REST-подібні ендпоінти, по одній теміці на теку
│   │   (auth, categories, chats, cities, cron, jobs, me, notifications,
│   │    orders, profile, proposals, pusher, reviews, upload, user, zunor)
│   └── master/about/       # публічний лендинг для майстрів
├── lib/
│   ├── components/         # .svelte по фічах: chat, dashboard, jobs, orders,
│   │                        # onboarding, profile, header, landing, ui (shadcn)
│   ├── server/              # серверний код (не імпортувати з клієнтських компонентів)
│   │   ├── auth.ts, guard.ts, guards.ts   — авторизація/захист роутів
│   │   ├── order-state-machine.ts          — переходи статусів Order
│   │   ├── dispatch/                       — движок матчингу заявка↔майстри
│   │   ├── zunor/                          — AI-чат-асистент (DeepSeek)
│   │   ├── prisma.ts, cloudinary.ts, pusher.ts, mailer.ts — клієнти інтеграцій
│   │   └── ranking.ts, rate-limit.ts, presence.ts, account-cache.ts
│   ├── categories/          # контент-шар категорій (див. "Движок vs контент")
│   ├── stores/               # Svelte 5 runes-стори (`*.svelte.ts`)
│   ├── notifications/, orders/, sound/, legal/, icons/, types/, utils/
│   └── auth-client.ts, pusher-client.ts  — клієнтські SDK-обгортки
└── generated/prisma/        # згенеровано, не редагувати руками
```

## Аліаси шляхів

SvelteKit-стандартний `$lib` → `src/lib`. Додатково, за `components.json`,
використовуються ці підаліаси (усі теж усередині `$lib`):

```
$lib/components  → компоненти
$lib/components/ui → shadcn-svelte UI-кіт
$lib/utils       → утиліти
$lib/hooks       → хуки
```

Використовуй `$lib/...`, не відносні `../../../` для всього, що виходить за
межі сусідньої теки.

## Ключові архітектурні патерни

### 1. «Движок vs контент» (з `MANIFESTO.md`, розділ 4)

При кожній технічній зміні став собі питання: **це движок чи контент?**

- **Схема БД, API-ендпоінти** — мають лишатися універсальними. Не додавай
  колонок/полів на кшталт `windowsCount` в `Job.metadata`-модель — усе
  специфічне для категорії живе в `metadata: Json?`.
- **Wizard-форми, тексти, іконки, термінологія** («клінер», «прибирання») —
  навмисно захардкожені під прибирання, зосереджені в окремих файлах
  (`src/lib/categories/cleaning/`, `src/lib/orders/labels.ts`).
- Мета: додавання нової категорії послуг завтра — це додавання контенту
  (нова тека в `categories/`, запис у `categories/registry.ts`), а не
  переписування движка.

**Не роби:** generic-wizard з конфігом із БД, мікросервіси, абстракції «про
запас» — проєкт свідомо лишається монолітом на SvelteKit.

### 2. Guard-и авторизації — два різних інструменти, не плутати

- **`src/lib/server/guard.ts` → `requireRole(locals, allowed, redirectTo)`** —
  для `+page.server.ts` / `load()`, коли треба перевірити **роль з БД**
  (роль читається напряму з таблиці `User`, не з сесії — сесію клієнт
  теоретично контролює, БД ні). Викликається одним рядком на початку `load`.
  На `/dashboard/**` бере готову роль з `locals.account` (її вже прочитав
  `guardHandle`), тож зайвого SELECT не робить.
- **`src/lib/server/guards.ts` → `requireUser` / `requireApiUser` /
  `requireApiSession`** — робота з `locals` (уже резолвлена сесія з
  `hooks.server.ts`). `requireUser` редіректить сторінку на логін,
  `requireApiUser`/`requireApiSession` кидають **401**, бо API-клієнту
  потрібен статус-код, а не HTML-редірект.

**Ніколи не викликай `auth.api.getSession()` у роуті.** Сесію на кожен запит
резолвить `sessionHandle` один раз і кладе в `locals` — повторний виклик це
зайва робота на кожен запит. Виняток лише один: `hooks.server.ts` (де вона й
резолвиться) та `api/auth/[...all]`, який віддає сам better-auth. Кілька
ендпоінтів (`upload/signature`, `user/media`, `user/update`) віддають 401 у
власному форматі `{ error }` замість `{ message }` від `error()` — там сесія
береться з `locals` напряму, без гарда, щоб не міняти контракт відповіді.

Не імплементуй перевірку сесії/ролі власноруч у роуті — завжди через ці
хелпери, інакше повторюється баг, описаний прямо в коментарі `guard.ts`
(сторінка майстра тихо показувалась клієнту).

### 3. `hooks.server.ts` — порядок middleware критичний

Ланцюжок: `securityHeaders → authHandle (better-auth) → sessionHandle
(locals.session/user) → guardHandle (banned → emailVerified → onboarded →
маршрут)`. Єдине джерело правди про сесію на запит — `locals`, не читай
сесію повторно всередині окремих роутів.

### 4. Order state machine

Усі переходи статусу `Order` (`CREATED → IN_PROGRESS → COMPLETED`, або
`CANCELLED` з обох) описані централізовано в
`src/lib/server/order-state-machine.ts` через `canTransition()` /
`nextStatus()`. **Не міняй `order.status` напряму в Prisma-запиті** з
роуту — завжди через цю стейт-машину, вона ж перевіряє, хто (`CLIENT` /
`MASTER` / `SYSTEM`) має право на перехід.

### 5. Dispatch engine (`src/lib/server/dispatch/`)

Це движок матчингу заявки (`Job`) з майстрами — хвилями (`wave`), зі
скорингом (`scoring.ts`) і журналюванням (`DispatchEvent` у Prisma, `log.ts`).
Реалізує принцип «push, а не pull» і «справедливий маркетплейс» з
`MANIFESTO.md` (гарантований слот для новачків, деескалація перевантажених
майстрів). Зміни в скорингу/хвилях звіряй з розділом «Уникальність №5» і
«Уникальність №2» маніфесту — це не просто технічна деталь, а частина УТП
продукту.

### 6. AI-агент (чат-помічник), без окремого персонажа

`src/lib/server/zunor/` — логіка агента, що веде діалог з клієнтом
(`agent.ts`), звертається до DeepSeek (`deepseek.ts`), визначає категорію
послуги (`detect-service.ts`, `service-rules.ts`) і будує промпт
(`prompt.ts`). **Окремого персонажа «Zuna» більше немає** — концепт прибрано,
асистент говорить від імені платформи як «Zunor» (третя особа: «Zunor
враховуватиме це…», див. `src/routes/(auth)/dashboard/settings/assistant/`).
Не додавай ім'я «Zuna», не звертайся від першої особи як окремий персонаж —
якщо натрапиш на старі згадки «Zuna» в коментарях/коді (наприклад,
`src/lib/components/zuna.svelte`), не копіюй цей патерн у нові місця; за
потреби перепитай, чи можна прибрати такий залишок.

Тон лишається теплим і людяним (не казенним, «Заявку створено» →
«Готово, я вже шукаю майстра» — цей принцип із `MANIFESTO.md` актуальний),
просто без персоніфікації в конкретного «героя».

Тестові сценарії для ручної перевірки діалогу — `docs/zunor-test-dialogs.md`.
Онови/додай туди сценарій, якщо міняєш логіку `agent.ts` чи `prompt.ts`.

### 7. Тости — тільки `svelte-hot-french-toast`

Проєкт використовує бібліотеку
[`svelte-hot-french-toast`](https://svelte-hot-french-toast.vercel.app/)
(вже в `package.json`). `<Toaster>` підключений один раз у кореневому
`src/routes/+layout.svelte` з кастомними `toastOptions` (стилі під тему
проєкту, `class: 'app-toast'`) — **не додавай другий `<Toaster>`** в інших
лейаутах чи сторінках.

Виклик з будь-якого клієнтського коду:

```ts
import toast from 'svelte-hot-french-toast'

toast.success('Збережено')
toast.error(j?.message ?? 'Не вдалося зберегти')
toast('Просте повідомлення', { icon: SomeIcon })
```

Правила ті самі, що й для будь-якого клієнтського UI-стану: виклик тільки в
браузерному коді (обробники подій, `onMount`, `$effect`), не в
`load`/actions на сервері. Щоб показати серверну помилку — поверни текст з
ендпоінта і виклич `toast.error(text)` на клієнті (див. приклад у
`src/routes/(auth)/dashboard/settings/assistant/+page.svelte`).

Для нотифікацій із realtime (Pusher) є окрема обгортка
`src/lib/notifications/toast.ts` (`showNotificationToast`) — вона одна
знає мапінг типу нотифікації на вигляд тоста; не дублюй цю логіку в
компонентах, викликай саме її.

**Легасі, не використовувати:** `src/lib/stores/toast-store.svelte.ts` і
`src/lib/components/toast/*` (`toster.md` — документація на цю стару
систему) — залишки кастомного тостера, вже ніде не підключені (в
`+layout.svelte` тепер `<Toaster>` з `svelte-hot-french-toast`). Не
імпортуй з них і не веди туди нову логіку; якщо завдання торкається
тостів і ці файли трапляються на очі — вважай їх мертвим кодом, за потреби
запропонуй видалити разом з `toster.md`.

### 8. Svelte 5 runes

`runes: true` примусово ввімкнено для всього коду проєкту (крім
`node_modules`) у `svelte.config.js`. Пиши стори через `$state`/`$derived`
(файли `*.svelte.ts`), не через застарілі `writable`/`derived` зі
`svelte/store`, якщо для цього немає явної причини сумісності.

## Стиль коду (Prettier, `.prettierrc`)

- Одинарні лапки, **без крапки з комою** (`semi: false`)
- 2 пробіли на відступ
- Порядок у `.svelte`: `scripts → markup → styles → options`
- Plugin `prettier-plugin-svelte` для `.svelte`-файлів

ESLint у проєкті не налаштований — не додавай `eslint-disable` коментарі й не
посилайся на eslint-правила, яких тут немає.

## Що НЕ робити

- Не чіпати `src/generated/prisma/` руками — тільки через `prisma migrate` /
  regen.
- Не міняти `Order.status` напряму, оминаючи `order-state-machine.ts`.
- Не писати перевірку ролі/сесії вручну в роуті — тільки через `guard.ts` /
  `guards.ts`.
- Не додавати категорійно-специфічні колонки в спільні моделі (`Job`,
  `Order`) — усе специфічне йде в `metadata: Json?` + контент-шар
  `src/lib/categories/`.
- Не показувати телефон клієнта чи майстра одне одному до вибору майстра
  (`Order` ще не створено) — це свідоме продуктове рішення з маніфесту
  («захист контактів до угоди», як у Uber). Дивись, як це вже реалізовано
  у `src/lib/server/profile.ts`, перед тим як міняти видимість полів.
- Не повертати персонажа «Zuna» — асистент говорить від імені платформи
  («Zunor»), без окремого імені/першої особи персонажа.
- Не писати текст асистента чи системні повідомлення казенною мовою («Ваш
  запит оброблюється») — тон має лишатися теплим і людяним, як описано в
  `MANIFESTO.md`.
- Не створювати новий `<Toaster>` чи новий кастомний toast-стор — тости
  тільки через `svelte-hot-french-toast`, підключений в кореневому
  `+layout.svelte`. Не імпортувати з `$lib/stores/toast-store.svelte.ts` чи
  `$lib/components/toast/*` — це мертвий легасі-код.
- Не додавати публічний `username`/сторінку для клієнта — навмисно є тільки
  у майстра (клієнт — не «вітрина», див. розділ «Профілі» маніфесту).
- Не вигадувати `npm run lint` / `npm run test` — таких скриптів немає, є
  лише `npm run check`.
- Не коммітити `.env` чи реальні ключі, навіть у приклади/тести.

## Комміти

Якщо агент має право комітити — уточни в конкретному завданні; за
замовчуванням вважай, що коміт робить людина. Якщо явно попросили закомітити —
один змістовний коміт на завершену зміну, без проміжного сміття.ы