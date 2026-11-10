# Деплой на Vercel

Код працює і на Hostinger (один Node-процес), і на Vercel (функції) —
адаптер і режим обираються самі за змінною `VERCEL`, яку виставляє Vercel
(`svelte.config.js`, `src/lib/server/runtime.ts`). Що на Vercel інакше й
чому — AGENTS.md, розділ 2.1.

## 0. Перед першим деплоєм

- **Закоміть і запуш** усе в GitHub-репозиторій сайту: Vercel збирає
  те, що в гіті, а не робочу теку.
- **Тестовий чи бойовий?** Для тесту (мобільний застосунок проти нього)
  — окрема гілка бази в Neon і окремий Telegram-бот (або без нього).
  Бойовий поруч із Hostinger на ТІЙ САМІЙ базі не запускай: два сервери
  слатимуть хвилі й нагадування однієї бази.

## 1. Проєкт у Vercel

1. vercel.com → **Add New → Project** → імпорт репозиторію сайту.
2. Framework — **SvelteKit** (визначиться сам). Root — корінь репозиторію.
   Build command — стандартний `npm run build` (він сам робить
   `prisma generate`). Node.js — 22.
3. Змінні (п. 2) — **до** першої збірки: частина з них вшивається на
   збірці, і без них вона впаде.

## 2. Змінні середовища (Settings → Environment Variables)

| Змінна | Звідки / що |
| --- | --- |
| `DATABASE_URL` | Neon → Connection string, **Pooled** (хост із `-pooler`). Для тесту — гілка бази |
| `BETTER_AUTH_URL` | адреса деплою без слешу: `https://<проєкт>.vercel.app` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` (для тесту — свій, не бойовий) |
| `CRON_SECRET` | `openssl rand -hex 32` — Vercel сам підставить його в запит крона |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | **обовʼязково** на Vercel: ліміти, код 2FA адмінки, стан акаунта |
| `QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | **обовʼязково**: console.upstash.com → QStash. Без них хвилі 2–4 прийдуть лише з кроном, тобто до доби пізніше |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | як на Hostinger |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | як на Hostinger |
| `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`, `PUBLIC_PUSHER_KEY`, `PUBLIC_PUSHER_CLUSTER` | як на Hostinger (для тесту можна окремий Pusher app) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud → OAuth client; додай redirect URI `<BETTER_AUTH_URL>/api/auth/callback/google` |
| `DEEPSEEK_API_KEY` | ключ DeepSeek |
| `TELEGRAM_BOT_TOKEN` | для тесту — **окремий** бот або не задавай; бойовий токен перехопив би вебхук |
| `ZUNOR_EXPO_GO` | `1` — **лише тестовий** деплой: пускає вхід з Expo Go (`exp://`) |
| `ZUNOR_VERCEL_REGION` | лише якщо база Neon не у Франкфурті (за замовчуванням `fra1`) |

## 3. База

- Схему накочуєш сам, як завжди, на ту базу, куди дивиться деплой:
  `DATABASE_URL=<рядок цієї бази> npx prisma migrate deploy`.
  Під час збірки міграції не запускаються — навмисно.
- Регіон функцій (`fra1`) має збігатися з регіоном бази: кожен запит
  робить кілька походів у базу.

## 4. Після першого деплою

- Адреса вийшла інша, ніж у `BETTER_AUTH_URL` — виправ змінну й
  **Redeploy** (вона вшита в збірку).
- Перевір:
  1. вхід поштою й паролем;
  2. нова заявка → у консолі QStash зʼявились три відкладені повідомлення
     (хвилі на 2-й, 5-й і 10-й хвилині), за 10 хв — вони виконані;
  3. Vercel → Settings → Cron Jobs → **Run** біля `/api/cron?task=all` →
     відповідь `ok: true`;
  4. адмінка: код 2FA приймається й не питається знову на кожному кліку.

## 5. Що треба знати

- **Крон** (`vercel.json`) — раз на добу о 15:05 UTC (18:05 за Києвом
  улітку, 17:05 узимку): прострочені заявки, страховка розсилки,
  нагадування на завтра. На безкоштовному Hobby крон — лише раз на добу й
  у межах години; частіше — тариф Pro.
- **Hobby — лише для некомерційних проєктів.** Для запуску з клієнтами
  потрібен Pro.
- Функції спершу «холодні»: перший запит після простою — довший.
- **Мобільний застосунок проти деплою:** `EXPO_PUBLIC_API_URL=<BETTER_AUTH_URL>`
  у `mobile/.env`; для Expo Go на тестовому деплої — `ZUNOR_EXPO_GO=1`.
