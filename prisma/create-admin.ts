// prisma/create-admin.ts
//
// Акаунт адміністратора з поштою й паролем — вхід у Zunor звичайною
// формою «Пошта + пароль», далі /admin і код другого фактора.
//
// Запуск (ЗАПУСКАЄ ЛЮДИНА у своєму терміналі — пароль бачить лише вона):
//   npx tsx prisma/create-admin.ts                     # admin@zunor.org
//   npx tsx prisma/create-admin.ts boss@example.com
//
// Пароль генерується тут же (24 випадкові символи, ~143 біти) і
// друкується ОДИН раз. У базі — лише хеш better-auth (scrypt).
//
// Повторний запуск із тією ж поштою — НОВИЙ пароль: старий перестає
// діяти, усі сесії цього акаунта закриваються. Так само, якщо пароль
// загубився.
//
// Інших співробітників створює вже ADMIN в адмінці («Співробітники»), з
// журналом. Цей скрипт — для першого входу й аварійної заміни пароля.
//
// Пошта: відновлення пароля шле лист на неї, тож скринька мусить бути
// ВАША або не існувати на вашому ж домені. Чужий домен (чи такий, що
// можна зареєструвати) — це скидання пароля адміна для того, хто ним
// заволодіє.

import 'dotenv/config'
import { randomInt } from 'node:crypto'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { hashPassword } from 'better-auth/crypto'
import { Redis } from '@upstash/redis'
import Pusher from 'pusher'

const DEFAULT_EMAIL = 'qscft@zunor.org'
const NAME = 'Адміністратор'
const STAFF = new Set(['ADMIN', 'MANAGER', 'MODERATOR'])

function fail(message: string): never {
  console.error(`✗ ${message}`)
  process.exit(1)
}

const email = (process.argv[2] ?? DEFAULT_EMAIL).trim().toLowerCase()
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`Це не схоже на пошту: ${email}`)

const connectionString = process.env.DATABASE_URL
if (!connectionString) fail('DATABASE_URL не знайдено в .env')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

/** 4 групи по 6 знаків: літери й цифри без схожих (0/O, 1/l/I). */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const group = () => Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('')
  return [group(), group(), group(), group()].join('-')
}

// Redis і Pusher — необовʼязкові, як і в застосунку: без них просто
// нічого скидати.
const { UPSTASH_REDIS_REST_URL: redisUrl, UPSTASH_REDIS_REST_TOKEN: redisToken } = process.env
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null

/** Ключі — як у redis.ts (префікс zunor:), auth-storage.ts і account-cache.ts. */
async function dropCaches(userId: string, sessionTokens: string[]) {
  if (redis) {
    const keys = [
      `zunor:account:${userId}`,
      `zunor:auth:active-sessions-${userId}`,
      ...sessionTokens.map((t) => `zunor:auth:${t}`),
    ]
    await redis.del(...keys).catch((e) => console.warn(`! Redis: ${e}`))
  }
  // Памʼять запущеного сервера скидає та сама подія, якою це робила CRM
  // (account-cache.ts, subscribeToInvalidations).
  const { PUSHER_APP_ID: appId, PUSHER_KEY: key, PUSHER_SECRET: secret } = process.env
  if (appId && key && secret) {
    await new Pusher({ appId, key, secret, cluster: process.env.PUSHER_CLUSTER ?? 'eu' })
      .trigger('account-updates', 'invalidate', { userId })
      .catch((e) => console.warn(`! Pusher: ${e} — перезапустіть сервер`))
  }
}

async function main() {
  const password = generatePassword()
  const hash = await hashPassword(password)

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, banned: true, masterProfile: { select: { id: true } } },
  })

  if (!existing) {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: NAME,
          emailVerified: true, // скринька може й не існувати — код підтвердження не потрібен
          role: 'ADMIN',
        },
        select: { id: true },
      })
      // accountId = id користувача — так пише сам better-auth при реєстрації.
      await tx.account.create({
        data: { userId: user.id, providerId: 'credential', accountId: user.id, password: hash },
      })
    })
    console.log(`✓ Створено адміністратора ${email}`)
  } else {
    // Чужий звичайний акаунт сюди не перетворюємо: це був би спосіб
    // забрати його собі. Лише заміна пароля вже наявному співробітнику.
    if (!STAFF.has(existing.role)) {
      fail(`Пошта ${email} уже зайнята звичайним акаунтом (${existing.role}) — візьміть іншу`)
    }
    if (existing.masterProfile) fail('У цього акаунта є анкета майстра — візьміть іншу пошту')
    if (existing.banned) fail('Акаунт заблоковано — розблокуйте його в адмінці іншим ADMIN')

    const sessions = await prisma.session.findMany({
      where: { userId: existing.id },
      select: { token: true },
    })
    await prisma.$transaction([
      prisma.account.deleteMany({ where: { userId: existing.id, providerId: 'credential' } }),
      prisma.account.create({
        data: { userId: existing.id, providerId: 'credential', accountId: existing.id, password: hash },
      }),
      prisma.user.update({ where: { id: existing.id }, data: { emailVerified: true } }),
      prisma.session.deleteMany({ where: { userId: existing.id } }),
    ])
    await dropCaches(existing.id, sessions.map((s) => s.token))
    console.log(`✓ Пароль для ${email} замінено, усі його сесії закрито`)
  }

  console.log(`
  Пошта:   ${email}
  Пароль:  ${password}

  Збережіть пароль у менеджері паролів — більше його ніде не видно.
  Вхід: /user/login → «Пошта й пароль», потім /admin → QR-код у
  Google Authenticator і 6 цифр.
`)
}

main()
  .catch((e) => fail(String(e)))
  .finally(() => prisma.$disconnect())
