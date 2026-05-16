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
  // Спецопція
  { slug: 'all', name: 'Вся Україна', region: null, sortOrder: 0 },

  // Столиця
  {
    slug: 'kyiv',
    name: 'Київ',
    region: 'Київська',
    isCapital: true,
    sortOrder: 1,
  },

  // Міста-мільйонники (без столиці)
  { slug: 'kharkiv', name: 'Харків', region: 'Харківська', sortOrder: 2 },
  { slug: 'odesa', name: 'Одеса', region: 'Одеська', sortOrder: 3 },
  { slug: 'dnipro', name: 'Дніпро', region: 'Дніпропетровська', sortOrder: 4 },
  { slug: 'lviv', name: 'Львів', region: 'Львівська', sortOrder: 5 },

  // Обласні центри (алфавітний порядок)
  { slug: 'vinnytsia', name: 'Вінниця', region: 'Вінницька', sortOrder: 10 },
  { slug: 'lutsk', name: 'Луцьк', region: 'Волинська', sortOrder: 11 },
  { slug: 'donetsk', name: 'Донецьк', region: 'Донецька', sortOrder: 12 },
  { slug: 'zhytomyr', name: 'Житомир', region: 'Житомирська', sortOrder: 13 },
  { slug: 'uzhhorod', name: 'Ужгород', region: 'Закарпатська', sortOrder: 14 },
  {
    slug: 'zaporizhzhia',
    name: 'Запоріжжя',
    region: 'Запорізька',
    sortOrder: 15,
  },
  {
    slug: 'ivano-frankivsk',
    name: 'Івано-Франківськ',
    region: 'Івано-Франківська',
    sortOrder: 16,
  },
  {
    slug: 'kropyvnytskyi',
    name: 'Кропивницький',
    region: 'Кіровоградська',
    sortOrder: 17,
  },
  { slug: 'luhansk', name: 'Луганськ', region: 'Луганська', sortOrder: 18 },
  { slug: 'mykolaiv', name: 'Миколаїв', region: 'Миколаївська', sortOrder: 19 },
  { slug: 'poltava', name: 'Полтава', region: 'Полтавська', sortOrder: 20 },
  { slug: 'rivne', name: 'Рівне', region: 'Рівненська', sortOrder: 21 },
  { slug: 'sumy', name: 'Суми', region: 'Сумська', sortOrder: 22 },
  {
    slug: 'ternopil',
    name: 'Тернопіль',
    region: 'Тернопільська',
    sortOrder: 23,
  },
  { slug: 'kherson', name: 'Херсон', region: 'Херсонська', sortOrder: 24 },
  {
    slug: 'khmelnytskyi',
    name: 'Хмельницький',
    region: 'Хмельницька',
    sortOrder: 25,
  },
  { slug: 'cherkasy', name: 'Черкаси', region: 'Черкаська', sortOrder: 26 },
  {
    slug: 'chernivtsi',
    name: 'Чернівці',
    region: 'Чернівецька',
    sortOrder: 27,
  },
  {
    slug: 'chernihiv',
    name: 'Чернігів',
    region: 'Чернігівська',
    sortOrder: 28,
  },
  { slug: 'simferopol', name: 'Сімферополь', region: 'АР Крим', sortOrder: 29 },

  // Інші великі міста (>100k)
  {
    slug: 'kryvyi-rih',
    name: 'Кривий Ріг',
    region: 'Дніпропетровська',
    sortOrder: 50,
  },
  { slug: 'mariupol', name: 'Маріуполь', region: 'Донецька', sortOrder: 51 },
  {
    slug: 'mukachevo',
    name: 'Мукачево',
    region: 'Закарпатська',
    sortOrder: 52,
  },
  {
    slug: 'melitopol',
    name: 'Мелітополь',
    region: 'Запорізька',
    sortOrder: 53,
  },
  {
    slug: 'nikopol',
    name: 'Нікополь',
    region: 'Дніпропетровська',
    sortOrder: 54,
  },
  {
    slug: 'bila-tserkva',
    name: 'Біла Церква',
    region: 'Київська',
    sortOrder: 55,
  },
  {
    slug: 'kramatorsk',
    name: 'Краматорськ',
    region: 'Донецька',
    sortOrder: 56,
  },
  {
    slug: 'sloviansk',
    name: "Слов'янськ",
    region: 'Донецька',
    sortOrder: 57,
  },
  {
    slug: 'kamianets-podilskyi',
    name: "Кам'янець-Подільський",
    region: 'Хмельницька',
    sortOrder: 58,
  },
  {
    slug: 'berdiansk',
    name: 'Бердянськ',
    region: 'Запорізька',
    sortOrder: 59,
  },
  { slug: 'drohobych', name: 'Дрогобич', region: 'Львівська', sortOrder: 60 },
  { slug: 'brovary', name: 'Бровари', region: 'Київська', sortOrder: 61 },
  { slug: 'bucha', name: 'Буча', region: 'Київська', sortOrder: 62 },
  { slug: 'irpin', name: 'Ірпінь', region: 'Київська', sortOrder: 63 },
  { slug: 'boryspil', name: 'Бориспіль', region: 'Київська', sortOrder: 64 },
  { slug: 'fastiv', name: 'Фастів', region: 'Київська', sortOrder: 65 },
  {
    slug: 'pavlohrad',
    name: 'Павлоград',
    region: 'Дніпропетровська',
    sortOrder: 66,
  },
  {
    slug: 'kamianske',
    name: "Кам'янське",
    region: 'Дніпропетровська',
    sortOrder: 67,
  },
  {
    slug: 'oleksandriia',
    name: 'Олександрія',
    region: 'Кіровоградська',
    sortOrder: 68,
  },
  { slug: 'stryi', name: 'Стрий', region: 'Львівська', sortOrder: 69 },
  {
    slug: 'kovel',
    name: 'Ковель',
    region: 'Волинська',
    sortOrder: 70,
  },
  {
    slug: 'novomoskovsk',
    name: 'Новомосковськ',
    region: 'Дніпропетровська',
    sortOrder: 71,
  },
  {
    slug: 'konotop',
    name: 'Конотоп',
    region: 'Сумська',
    sortOrder: 72,
  },
  {
    slug: 'uman',
    name: 'Умань',
    region: 'Черкаська',
    sortOrder: 73,
  },
  {
    slug: 'berdychiv',
    name: 'Бердичів',
    region: 'Житомирська',
    sortOrder: 74,
  },
  {
    slug: 'shostka',
    name: 'Шостка',
    region: 'Сумська',
    sortOrder: 75,
  },
  {
    slug: 'nizhyn',
    name: 'Ніжин',
    region: 'Чернігівська',
    sortOrder: 76,
  },
  {
    slug: 'izmail',
    name: 'Ізмаїл',
    region: 'Одеська',
    sortOrder: 77,
  },
  {
    slug: 'lozova',
    name: 'Лозова',
    region: 'Харківська',
    sortOrder: 78,
  },
  {
    slug: 'yevpatoriia',
    name: 'Євпаторія',
    region: 'АР Крим',
    sortOrder: 79,
  },
  {
    slug: 'kerch',
    name: 'Керч',
    region: 'АР Крим',
    sortOrder: 80,
  },
  {
    slug: 'yalta',
    name: 'Ялта',
    region: 'АР Крим',
    sortOrder: 81,
  },
  {
    slug: 'horlivka',
    name: 'Горлівка',
    region: 'Донецька',
    sortOrder: 82,
  },
  {
    slug: 'makiivka',
    name: 'Макіївка',
    region: 'Донецька',
    sortOrder: 83,
  },
  {
    slug: 'bakhmut',
    name: 'Бахмут',
    region: 'Донецька',
    sortOrder: 84,
  },
  {
    slug: 'sievierodonetsk',
    name: 'Сєвєродонецьк',
    region: 'Луганська',
    sortOrder: 85,
  },
  {
    slug: 'lysychansk',
    name: 'Лисичанськ',
    region: 'Луганська',
    sortOrder: 86,
  },
  {
    slug: 'alchevsk',
    name: 'Алчевськ',
    region: 'Луганська',
    sortOrder: 87,
  },
  {
    slug: 'enerhodar',
    name: 'Енергодар',
    region: 'Запорізька',
    sortOrder: 88,
  },
  {
    slug: 'nova-kakhovka',
    name: 'Нова Каховка',
    region: 'Херсонська',
    sortOrder: 89,
  },
  {
    slug: 'kalush',
    name: 'Калуш',
    region: 'Івано-Франківська',
    sortOrder: 90,
  },
  {
    slug: 'kolomyia',
    name: 'Коломия',
    region: 'Івано-Франківська',
    sortOrder: 91,
  },
  {
    slug: 'truskavets',
    name: 'Трускавець',
    region: 'Львівська',
    sortOrder: 92,
  },
  {
    slug: 'chervonohrad',
    name: 'Червоноград',
    region: 'Львівська',
    sortOrder: 93,
  },
  {
    slug: 'shepetivka',
    name: 'Шепетівка',
    region: 'Хмельницька',
    sortOrder: 94,
  },
  {
    slug: 'smila',
    name: 'Сміла',
    region: 'Черкаська',
    sortOrder: 95,
  },
  {
    slug: 'pryluky',
    name: 'Прилуки',
    region: 'Чернігівська',
    sortOrder: 96,
  },
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
