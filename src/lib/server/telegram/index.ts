// Telegram-бот Zunor (grammY): сповіщення, коли сайт закрито.
//
// Навіщо. Сповіщення в застосунку живуть лише у відкритій вкладці
// (Pusher). Майстер закрив браузер — про заявку поруч дізнався б
// наступного разу, коли зайде, а швидкість відгуку — головна метрика
// (MANIFESTO, правило №2). Telegram в Україні є майже в кожного, і пуш
// звідти приходить на телефон завжди.
//
// Що робить:
//   • дублює кожне сповіщення (усе, що йде через pushNotification) у чат
//     із ботом — заголовок, подробиці й кнопка дії, як у картці на сайті;
//   • /start <токен> — привʼязує чат до акаунта (токен — з налаштувань
//     сповіщень, див. link-token.ts); /stop — відвʼязує.
//
// Як отримує оновлення:
//   • прод — вебхук POST /api/telegram/webhook із секретним заголовком;
//     адресу бот ставить собі сам на старті процесу (startTelegram);
//   • dev — long polling. Але ЛИШЕ якщо в бота немає вебхука: polling
//     знімає вебхук, і запуск dev із токеном продового бота мовчки
//     вимкнув би бота на проді. Для розробки — окремий бот.
//
// Без TELEGRAM_BOT_TOKEN усе вимкнене: getBot() → null, налаштування
// блоку Telegram не показують, сповіщення йдуть лише на сайт.

import { Bot, GrammyError, InlineKeyboard, webhookCallback } from 'grammy'
import { createHash } from 'node:crypto'
import { env } from '$env/dynamic/private'
import { dev } from '$app/environment'
import { prisma } from '../prisma'
import { createLinkToken, verifyLinkToken } from './link-token'
import { chatIdOf, forgetChatId } from './chat-cache'
import { kindText } from '$lib/notifications/kinds'
import { linkFor } from '$lib/notifications/types'
import type { Notification } from '../../../generated/prisma/client'

function token(): string {
  return env.TELEGRAM_BOT_TOKEN?.trim() ?? ''
}

export function telegramEnabled(): boolean {
  return token().length > 0
}

/**
 * Секрети — похідні від токена бота: одна змінна в .env замість трьох.
 * Змінили токен — змінились і вони (старі посилання привʼязки й вебхук
 * перестають діяти, що й треба).
 */
function derived(purpose: string): string {
  return createHash('sha256').update(`zunor-${purpose}:${token()}`).digest('hex')
}

/** Telegram шле його в X-Telegram-Bot-Api-Secret-Token (до 256 символів, [A-Za-z0-9_-]). */
function webhookSecret(): string {
  return derived('webhook').slice(0, 64)
}

/** Адреса сайту для кнопок і вебхука — без слешу в кінці. */
function siteUrl(): string | null {
  const raw = env.BETTER_AUTH_URL?.trim().replace(/\/+$/, '')
  return raw || null
}

/**
 * Telegram не приймає кнопок із localhost (BUTTON_URL_INVALID) — у dev
 * повідомлення йде без кнопки, а не падає цілком.
 */
function buttonUrl(path: string): string | null {
  const base = siteUrl()
  if (!base) return null
  try {
    const host = new URL(base).hostname
    if (host === 'localhost' || host.startsWith('127.') || host === '0.0.0.0') {
      return null
    }
  } catch {
    return null
  }
  return `${base}${path}`
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

// ─── Бот ───

let bot: Bot | null = null

export function getBot(): Bot | null {
  if (!telegramEnabled()) return null
  if (!bot) {
    bot = new Bot(token())
    registerHandlers(bot)
  }
  return bot
}

const WELCOME =
  'Привіт! Це бот Zunor — сюди приходитимуть сповіщення: нові заявки, ' +
  'відгуки майстрів, зміни замовлень.\n\n' +
  'Щоб підключити, відкрийте в Zunor «Налаштування» → «Сповіщення» і ' +
  'натисніть «Підключити Telegram».'

const EXPIRED =
  'Посилання застаріло. Відкрийте в Zunor «Налаштування» → «Сповіщення» ' +
  'і натисніть «Підключити Telegram» ще раз.'

function registerHandlers(b: Bot): void {
  b.command('start', async (ctx) => {
    if (ctx.chat.type !== 'private') return
    const payload = ctx.match.trim()
    if (!payload) {
      await ctx.reply(WELCOME)
      return
    }

    const userId = verifyLinkToken(payload, derived('link'))
    if (!userId) {
      await ctx.reply(EXPIRED)
      return
    }

    const linked = await linkChat(userId, String(ctx.chat.id))
    await ctx.reply(
      linked
        ? 'Готово! Сповіщення Zunor тепер приходитимуть сюди.\n\n' +
            'Вимкнути — /stop або в налаштуваннях сповіщень на сайті.'
        : EXPIRED,
    )
  })

  b.command('stop', async (ctx) => {
    if (ctx.chat.type !== 'private') return
    await unlinkChat(String(ctx.chat.id))
    await ctx.reply(
      'Сповіщення вимкнено. Увімкнути знову — у налаштуваннях сповіщень Zunor.',
    )
  })

  // Бот не співрозмовник: на будь-що інше — коротко, що він уміє.
  b.on('message', async (ctx) => {
    if (ctx.chat.type !== 'private') return
    await ctx.reply(
      'Я лише надсилаю сповіщення Zunor. Відповісти клієнту чи майстру ' +
        'можна в чаті на сайті.',
    )
  })

  b.catch((err) => {
    console.error('[telegram] update failed:', err.error)
  })
}

// ─── Привʼязка ───

/**
 * Записує чат за акаунтом. Той самий чат в іншому акаунті відвʼязується:
 * один Telegram — один акаунт (стовпець унікальний).
 */
async function linkChat(userId: string, chatId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, banned: true },
  })
  if (!user || user.banned) return false

  const previous = await prisma.user.findMany({
    where: { telegramChatId: chatId, id: { not: userId } },
    select: { id: true },
  })

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { telegramChatId: chatId, id: { not: userId } },
      data: { telegramChatId: null, telegramLinkedAt: null },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { telegramChatId: chatId, telegramLinkedAt: new Date() },
    }),
  ])

  forgetChatId(userId)
  for (const p of previous) forgetChatId(p.id)
  return true
}

/** /stop у Telegram — відвʼязати акаунт, якому належить цей чат. */
async function unlinkChat(chatId: string): Promise<void> {
  const owners = await prisma.user.findMany({
    where: { telegramChatId: chatId },
    select: { id: true },
  })
  if (owners.length === 0) return
  await prisma.user.updateMany({
    where: { telegramChatId: chatId },
    data: { telegramChatId: null, telegramLinkedAt: null },
  })
  for (const o of owners) forgetChatId(o.id)
}

/**
 * «Відключити» в налаштуваннях. Боту — прощальне повідомлення, щоб у
 * чаті було видно, чому сповіщення більше не йдуть.
 */
export async function unlinkUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramChatId: true },
  })
  if (!user?.telegramChatId) return

  await prisma.user.update({
    where: { id: userId },
    data: { telegramChatId: null, telegramLinkedAt: null },
  })
  forgetChatId(userId)

  await getBot()
    ?.api.sendMessage(
      user.telegramChatId,
      'Telegram відключено від Zunor — сповіщення сюди більше не приходитимуть.',
    )
    .catch(() => {})
}

/**
 * Посилання «Підключити Telegram»: t.me/<бот>?start=<токен>. null — бот
 * не налаштований чи Telegram не відповів (імʼя бота береться з getMe).
 */
export async function telegramLinkUrl(userId: string): Promise<string | null> {
  const b = getBot()
  if (!b) return null
  try {
    // getMe лише при першому виклику; далі grammY тримає відповідь у памʼяті.
    // Тайм-аут — щоб сторінка налаштувань не висіла, якщо Telegram лежить.
    await Promise.race([
      b.init(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('getMe timeout')), 3000),
      ),
    ])
  } catch (err) {
    console.error('[telegram] init failed:', err)
    return null
  }
  const startToken = createLinkToken(userId, derived('link'))
  return `https://t.me/${b.botInfo.username}?start=${startToken}`
}

// ─── Надсилання ───

/**
 * Дублює сповіщення в Telegram, якщо людина його підключила. Нічого не
 * кидає: сповіщення вже в базі й на сайті, Telegram — лише ще один шлях.
 *
 * 403 від Telegram — людина заблокувала бота чи видалила чат: тоді
 * відвʼязуємо, інакше кожне наступне сповіщення марно стукало б туди ж.
 */
export async function sendToTelegram(n: Notification): Promise<void> {
  const b = getBot()
  if (!b) return

  try {
    const chatId = await chatIdOf(n.userId)
    if (!chatId) return

    const lines = [`<b>${escapeHtml(n.title)}</b>`]
    if (n.body) lines.push(escapeHtml(n.body))

    const url = buttonUrl(linkFor(n))
    await b.api.sendMessage(chatId, lines.join('\n'), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: url
        ? new InlineKeyboard().url(kindText(n.type).action, url)
        : undefined,
    })
  } catch (err) {
    if (err instanceof GrammyError && err.error_code === 403) {
      await prisma.user
        .update({
          where: { id: n.userId },
          data: { telegramChatId: null, telegramLinkedAt: null },
        })
        .catch(() => {})
      forgetChatId(n.userId)
      return
    }
    console.error('[telegram] send failed:', err)
  }
}

/**
 * Службове повідомлення людині в Telegram (не сповіщення: у стрічку
 * на сайті не потрапляє). Зараз — попередження про вхід в адмінку: якщо
 * це був не співробітник, він дізнається одразу. Нічого не кидає.
 */
export async function sendTelegramText(userId: string, text: string): Promise<void> {
  const b = getBot()
  if (!b) return
  try {
    const chatId = await chatIdOf(userId)
    if (!chatId) return
    await b.api.sendMessage(chatId, escapeHtml(text), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    })
  } catch (err) {
    console.error('[telegram] text failed:', err)
  }
}

// ─── Вебхук і запуск ───

let webhookHandler: ((event: { request: Request }) => Promise<Response>) | null =
  null

/** Обробник POST /api/telegram/webhook; null — бот не налаштований. */
export function telegramWebhook():
  | ((event: { request: Request }) => Promise<Response>)
  | null {
  const b = getBot()
  if (!b) return null
  // Адаптер sveltekit віддає Response, але в типах grammY це unknown.
  webhookHandler ??= webhookCallback(b, 'sveltekit', {
    // Без правильного секрету — 401: оновлення може надіслати лише Telegram.
    secretToken: webhookSecret(),
  }) as (event: { request: Request }) => Promise<Response>
  return webhookHandler
}

/** Polling у dev переживає HMR лише один: прапорець — на globalThis. */
const STARTED = Symbol.for('zunor.telegram.started')

/**
 * Старт процесу (init у hooks.server.ts): команди бота й спосіб отримувати
 * оновлення. Збій тут не валить сервер — сайт працює й без Telegram.
 */
export async function startTelegram(): Promise<void> {
  const b = getBot()
  if (!b) return

  const g = globalThis as Record<symbol, unknown>
  if (g[STARTED]) return
  g[STARTED] = true

  try {
    await b.init()
    await b.api.setMyCommands([
      { command: 'start', description: 'Підключити сповіщення Zunor' },
      { command: 'stop', description: 'Вимкнути сповіщення' },
    ])

    if (dev) {
      const info = await b.api.getWebhookInfo()
      if (info.url) {
        console.warn(
          `[telegram] @${b.botInfo.username} уже працює через вебхук (${info.url}). ` +
            'Polling у dev не запускаю, щоб не вимкнути бота на проді — ' +
            'для розробки створи окремого бота в @BotFather.',
        )
        return
      }
      // catch обовʼязковий: polling падає, якщо той самий бот уже
      // запущений деінде (409), а необроблений reject поклав би сервер.
      b.start({
        drop_pending_updates: true,
        allowed_updates: ['message'],
        onStart: (me) => console.log(`[telegram] polling @${me.username}`),
      }).catch((err) => {
        g[STARTED] = false
        console.error('[telegram] polling stopped:', err)
      })
      return
    }

    const base = siteUrl()
    if (!base) {
      console.warn('[telegram] BETTER_AUTH_URL порожній — вебхук не встановлено')
      return
    }
    await b.api.setWebhook(`${base}/api/telegram/webhook`, {
      secret_token: webhookSecret(),
      allowed_updates: ['message'],
    })
    console.log(`[telegram] webhook @${b.botInfo.username} → ${base}`)
  } catch (err) {
    g[STARTED] = false
    console.error('[telegram] start failed:', err)
  }
}
