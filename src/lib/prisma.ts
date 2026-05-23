import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { DATABASE_URL } from '$env/static/private'
import { dev } from '$app/environment'

// ─── Singleton ───
// В dev Vite перевыконує цей файл при кожному hot-reload — без singleton
// це означало б десятки нових PrismaClient інстансів і вичерпання
// connection pool у Postgres ("too many connections").
//
// На проді — звичайний експорт, бо файл виконується один раз при старті.

const adapter = new PrismaPg({ connectionString: DATABASE_URL })

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: dev ? ['warn', 'error'] : ['error'],
  })

if (dev) globalForPrisma.prisma = prisma
