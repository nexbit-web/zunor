// prisma/seed-categories.ts
//
// Запуск:
//   npx tsx prisma/seed-categories.ts
//
// На MVP — одна категорія «Прибирання» для Одеси.
// Інші категорії додамо пізніше, по мірі росту.

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL не знайдено в .env')
}

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

// ─── Конфігурація MVP ───
// Одна категорія. Структура підкатегорій (типи прибирання) живе на UI-рівні
// як пресети форми, не в БД. Це дозволяє додавати/змінювати їх без міграцій.

const CATEGORIES = [
  {
    slug: 'prybyrannya',
    name: 'Прибирання',
    description:
      'Прибирання квартир, будинків та офісів. Звичайне, генеральне, після ремонту, миття вікон, хімчистка диванів.',
    icon: 'Sparkles',
    sortOrder: 0,
  },
]

async function seed() {
  console.log('🌱 Seeding categories…')

  for (const cat of CATEGORIES) {
    const category = await prisma.category.upsert({
      where: { slug: cat.slug },
      create: {
        slug: cat.slug,
        name: cat.name,
        description: cat.description,
        icon: cat.icon,
        sortOrder: cat.sortOrder,
        isActive: true,
      },
      update: {
        name: cat.name,
        description: cat.description,
        icon: cat.icon,
        sortOrder: cat.sortOrder,
      },
    })

    console.log(`  ✓ ${category.name} (${category.slug})`)
  }

  const total = await prisma.category.count()
  console.log(`\n📊 Total categories: ${total}`)
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
