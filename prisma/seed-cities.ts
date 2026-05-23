// prisma/seed-cities.ts
//
// Запуск:
//   npx tsx prisma/seed-cities.ts
//
// Idempotent: можна запускати кілька разів — використовує upsert.

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL не знайдено в .env')
}

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

interface SeedCity {
  slug: string
  name: string
  region: string | null
  isCapital?: boolean
  sortOrder: number
}

// Спочатку — спецзначення "all", далі столиця, далі міста-мільйонники,
// потім інші обласні центри в алфавітному порядку, потім великі міста.
const CITIES: SeedCity[] = [
  { slug: 'odesa', name: 'Одеса', region: 'Одеська', sortOrder: 1 },
]

async function seed() {
  console.log('🌱 Seeding cities…')

  for (const c of CITIES) {
    await prisma.city.upsert({
      where: { slug: c.slug },
      create: {
        slug: c.slug,
        name: c.name,
        region: c.region,
        isCapital: c.isCapital ?? false,
        sortOrder: c.sortOrder,
      },
      update: {
        name: c.name,
        region: c.region,
        isCapital: c.isCapital ?? false,
        sortOrder: c.sortOrder,
      },
    })
    console.log(`  ✓ ${c.name}`)
  }

  const total = await prisma.city.count()
  console.log(`\n📊 Total cities: ${total}`)
  console.log('✅ Done!')
}

seed()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
