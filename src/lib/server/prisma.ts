import { PrismaClient } from '../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { DATABASE_URL } from '$env/static/private'
import { dev } from '$app/environment'

// * у dev Vite перевиконує файл на кожен hot-reload: без синглтона зʼєднання
// * з базою вичерпались би

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
