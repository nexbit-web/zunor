// Де живе сервер — від цього залежить, де тримати стан (AGENTS, 2.1).
//
// Hostinger (adapter-node) — ОДИН довгоживучий процес: таймери хвиль, ліміти
// й кеші в памʼяті працюють як задумано.
//
// Vercel (adapter-vercel) — функції: копій може бути кілька, кожна має
// свою памʼять, а між запитами функцію можуть заморозити. Там:
//   — хвилі 2–4 ставить черга QStash, а не setTimeout (dispatch/queue.ts);
//   — ліміти й «код другого фактора» — у Redis, а не в Map процесу;
//   — кеш стану акаунта — лише Redis, без памʼяті процесу;
//   — нагадування й прострочені заявки — крон Vercel (vercel.json);
//   — роботу після відповіді доробляє waitUntil (background.ts).

import { env } from '$env/dynamic/private'

/** Vercel виставляє VERCEL=1 і на збірці, і в рантаймі функцій. */
export const serverless = env.VERCEL === '1'

/**
 * Боєвий деплой, а не прев'ю гілки на Vercel. На Hostinger — завжди так.
 * Прев'ю не повинне, наприклад, перехоплювати вебхук Telegram-бота.
 */
export const productionDeploy = !serverless || env.VERCEL_ENV === 'production'
