//  npx tsx prisma/seed-categories.ts
//
// Запуск:
//   beauty
//
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL не знайдено в .env')
}

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

interface SeedService {
  slug: string
  name: string
  avgPriceCents?: number
}

interface SeedSubcategory {
  slug: string
  name: string
  icon?: string
  services: SeedService[]
}

interface SeedCategory {
  slug: string
  name: string
  description: string
  icon: string
  domain: 'ONLINE_ONLY' | 'OFFLINE_ONLY' | 'BOTH'
  subcategories: SeedSubcategory[]
}

const CATEGORIES: SeedCategory[] = [
  {
    slug: 'digital-marketing',
    name: 'Digital Marketing',
    domain: 'ONLINE_ONLY',
    description:
      'Просування бізнесу в інтернеті: SEO, реклама, SMM, аналітика, контент-маркетинг та стратегічний маркетинг',
    icon: 'TrendingUp',

    subcategories: [
      {
        slug: 'advertising',
        name: 'Реклама та просування',
        services: [
          { slug: 'context-ads', name: 'Налаштування контекстної реклами' },
          { slug: 'social-media-ads', name: 'Таргетована реклама' },
          { slug: 'serm', name: 'Пошукове управління репутацією (SERM)' },
          { slug: 'link-building', name: 'Link building' },
          { slug: 'crowd-marketing', name: 'Крауд маркетинг' },
          { slug: 'influence-marketing', name: 'Influence marketing' },
          {
            slug: 'mobile-app-promotion',
            name: 'Просування мобільних додатків',
          },
          {
            slug: 'marketplace-promotion',
            name: 'Просування на маркетплейсах',
          },
          { slug: 'other-online-ads', name: 'Інша реклама в Інтернеті' },
          { slug: 'classified-ads', name: 'Розміщення оголошень' },
        ],
      },

      {
        slug: 'seo',
        name: 'SEO та пошукове просування',
        services: [
          { slug: 'seo-optimization', name: 'SEO оптимізація сайту' },
          { slug: 'seo-audit', name: 'SEO аудит сайту' },
          { slug: 'website-promotion', name: 'Просування сайтів' },
          { slug: 'ecommerce-seo', name: 'SEO для інтернет-магазинів' },
          { slug: 'seo-texts', name: 'SEO-тексти' },
        ],
      },

      {
        slug: 'content-copywriting',
        name: 'Контент і копірайтинг',
        services: [
          { slug: 'copywriting', name: 'Копірайтинг' },
          { slug: 'rewriting', name: 'Рерайтінг' },
          { slug: 'expert-texts', name: 'Експертні тексти' },
          { slug: 'proofreading', name: 'Коректура тексту' },
          { slug: 'article-writing', name: 'Написання статей' },
          {
            slug: 'social-media-copywriting',
            name: 'Копірайтинг для соцмереж',
          },
          { slug: 'video-scripts', name: 'Тексти для відеороликів' },
          { slug: 'email-copy', name: 'Тексти для розсилок' },
          { slug: 'guides-checklists', name: 'Гайди і чек-листи' },
        ],
      },

      {
        slug: 'smm',
        name: 'SMM та соцмережі',
        services: [
          { slug: 'youtube-promotion', name: 'Просування YouTube' },
          { slug: 'facebook-promotion', name: 'Просування Facebook' },
          { slug: 'instagram-promotion', name: 'Просування Instagram' },
          { slug: 'tiktok-promotion', name: 'Просування TikTok' },
          { slug: 'telegram-promotion', name: 'Просування Telegram-каналів' },
          { slug: 'content-creation-smm', name: 'Створення контенту для SMM' },
          { slug: 'video-content-creation', name: 'Створення відеоконтенту' },
        ],
      },

      {
        slug: 'email-marketing',
        name: 'Email маркетинг',
        services: [{ slug: 'email-marketing', name: 'Email-маркетинг' }],
      },

      {
        slug: 'analytics',
        name: 'Аналітика та UX',
        services: [
          { slug: 'web-analytics', name: 'Веб-аналітика' },
          { slug: 'ga4-setup', name: 'Налаштування Google Analytics 4' },
          {
            slug: 'cross-channel-analytics',
            name: 'Наскрізна аналітика та візуалізація даних',
          },
          {
            slug: 'mobile-app-analytics',
            name: 'Аналітика мобільних додатків',
          },
          { slug: 'ux-audit', name: 'Юзабіліті аудит і CRO' },
        ],
      },

      {
        slug: 'marketplace-ads',
        name: 'Маркетплейси',
        services: [
          { slug: 'ebay-promotion', name: 'Просування на Ebay' },
          { slug: 'etsy-promotion', name: 'Просування на Etsy' },
          { slug: 'amazon-promotion', name: 'Просування на Amazon' },
          { slug: 'rozetka-promotion', name: 'Просування на Rozetka' },
          { slug: 'prom-promotion', name: 'Просування на Prom' },
          { slug: 'app-store-ads', name: 'Реклама в мобільних сторах (ASA)' },
          { slug: 'aso', name: 'Оптимізація додатків (ASO)' },
        ],
      },

      {
        slug: 'consulting',
        name: 'Консалтинг',
        services: [
          {
            slug: 'marketing-consulting',
            name: 'Консультація з інтернет-маркетингу',
          },
        ],
      },
    ],
  },
]

async function seed() {
  console.log('🌱 Seeding categories v2…')

  for (let catIdx = 0; catIdx < CATEGORIES.length; catIdx++) {
    const cat = CATEGORIES[catIdx]

    // Зверніть увагу: я додав поле 'domain' в upsert
    const category = await prisma.category.upsert({
      where: { slug: cat.slug },
      create: {
        slug: cat.slug,
        name: cat.name,
        description: cat.description,
        icon: cat.icon,
        domain: cat.domain, // Нове поле
        sortOrder: catIdx,
        status: 'ACTIVE',
      },
      update: {
        name: cat.name,
        description: cat.description,
        icon: cat.icon,
        domain: cat.domain,
        sortOrder: catIdx,
      },
    })

    console.log(`  ✓ ${category.name} (${cat.domain})`)

    for (let subIdx = 0; subIdx < cat.subcategories.length; subIdx++) {
      const sub = cat.subcategories[subIdx]

      const subcategory = await prisma.subcategory.upsert({
        where: {
          categoryId_slug: {
            categoryId: category.id,
            slug: sub.slug,
          },
        },
        create: {
          categoryId: category.id,
          slug: sub.slug,
          name: sub.name,
          icon: sub.icon ?? null,
          sortOrder: subIdx,
          status: 'ACTIVE',
        },
        update: {
          name: sub.name,
          icon: sub.icon ?? null,
          sortOrder: subIdx,
        },
      })

      for (let srvIdx = 0; srvIdx < sub.services.length; srvIdx++) {
        const srv = sub.services[srvIdx]

        await prisma.service.upsert({
          where: {
            subcategoryId_slug: {
              subcategoryId: subcategory.id,
              slug: srv.slug,
            },
          },
          create: {
            subcategoryId: subcategory.id,
            slug: srv.slug,
            name: srv.name,
            avgPriceCents: srv.avgPriceCents ?? null,
            sortOrder: srvIdx,
            status: 'ACTIVE',
          },
          update: {
            name: srv.name,
            avgPriceCents: srv.avgPriceCents ?? null,
            sortOrder: srvIdx,
          },
        })
      }
    }
  }

  const totalCategories = await prisma.category.count()
  const totalSubcategories = await prisma.subcategory.count()
  const totalServices = await prisma.service.count()

  console.log('\n📊 Summary:')
  console.log(`   Categories:    ${totalCategories}`)
  console.log(`   Subcategories: ${totalSubcategories}`)
  console.log(`   Services:      ${totalServices}`)
  console.log('\n✅ Done!')
}

seed()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
