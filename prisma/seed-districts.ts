// prisma/seed-districts.ts
//
// Запуск (після prisma/seed-cities.ts — район привʼязаний до міста):
//   npx tsx prisma/seed-districts.ts
//
// Idempotent: можна запускати кілька разів — використовує upsert. Район,
// прибраний із prisma/data/districts.ts, НЕ видаляється: на нього можуть
// посилатися профілі й заявки. Вимкнути його — isActive = false у БД.

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'
import { DISTRICTS } from './data/districts'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL не знайдено в .env')
}

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function seed() {
  console.log('🌱 Seeding districts…')

  // Без міста зовнішній ключ не пустить район — кажемо про це по-людськи,
  // а не стеком Postgres.
  const citySlugs = [...new Set(DISTRICTS.map((d) => d.citySlug))]
  const cities = await prisma.city.findMany({
    where: { slug: { in: citySlugs } },
    select: { slug: true },
  })
  const known = new Set(cities.map((c) => c.slug))
  const missing = citySlugs.filter((s) => !known.has(s))
  if (missing.length > 0) {
    throw new Error(
      `Міст ${missing.join(', ')} немає в БД — спершу npx tsx prisma/seed-cities.ts`,
    )
  }

  for (const [i, d] of DISTRICTS.entries()) {
    const data = {
      name: d.name,
      group: d.group,
      latitude: d.lat,
      longitude: d.lng,
      sortOrder: i,
    }
    await prisma.district.upsert({
      where: { citySlug_slug: { citySlug: d.citySlug, slug: d.slug } },
      create: { citySlug: d.citySlug, slug: d.slug, ...data },
      update: data,
    })
    console.log(`  ✓ ${d.citySlug} · ${d.name}`)
  }

  const total = await prisma.district.count()
  console.log(`\n📊 Total districts: ${total}`)
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
