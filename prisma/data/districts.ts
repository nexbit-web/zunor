// Райони міст для prisma/seed-districts.ts. Окремим файлом без побічних
// ефектів, щоб ті самі дані читали й тести (перевірка здорового глузду
// координат), а не лише сід.
//
// Точка — центр району за OpenStreetMap (Nominatim), а не адреса: точність
// ~1 км цілком достатня, щоб відрізнити «поруч» від «через усе місто».
//
// slug — стабільний ключ у БД (User.district, Job.district). Назву міняти
// можна, slug — ні: старі записи загубили б свою точку. Порядок у масиві —
// порядок у списку (sortOrder).

export interface SeedDistrict {
  citySlug: string
  slug: string
  name: string
  group: 'CITY' | 'SUBURB'
  lat: number
  lng: number
}

const odesa = (
  slug: string,
  name: string,
  group: SeedDistrict['group'],
  lat: number,
  lng: number,
): SeedDistrict => ({ citySlug: 'odesa', slug, name, group, lat, lng })

export const DISTRICTS: readonly SeedDistrict[] = [
  // ─── Одеса: місто, з півночі на південь ───
  odesa('kotovskoho', 'Селище Котовського', 'CITY', 46.579, 30.7916),
  odesa('luzanivka', 'Лузанівка', 'CITY', 46.555, 30.7607),
  odesa('peresyp', 'Пересип', 'CITY', 46.512, 30.7233),
  odesa('kryva-balka', 'Крива Балка', 'CITY', 46.4971, 30.6797),
  odesa('slobidka', 'Слобідка', 'CITY', 46.4949, 30.7034),
  odesa('center', 'Центр', 'CITY', 46.4843, 30.7357),
  odesa('moldavanka', 'Молдаванка', 'CITY', 46.474, 30.7145),
  odesa('zastava', 'Застава', 'CITY', 46.4678, 30.6771),
  odesa('buhaivka', 'Бугаївка', 'CITY', 46.4683, 30.6976),
  odesa('vidrada', 'Відрада', 'CITY', 46.4667, 30.756),
  odesa('sakhalinchyk', 'Сахалінчик', 'CITY', 46.458, 30.7338),
  odesa('mlyny', 'Ближні й Дальні Млини', 'CITY', 46.454, 30.697),
  odesa('malyi-fontan', 'Малий Фонтан', 'CITY', 46.4432, 30.7654),
  odesa('cheremushky', 'Черемушки', 'CITY', 46.4332, 30.7124),
  odesa('arkadiia', 'Аркадія', 'CITY', 46.4318, 30.7608),
  odesa('serednii-fontan', 'Середній Фонтан', 'CITY', 46.4125, 30.7546),
  odesa('raiduzhnyi', 'Райдужний', 'CITY', 46.4025, 30.705),
  odesa('tairova', 'Таїрова', 'CITY', 46.401, 30.723),
  odesa('velykyi-fontan', 'Великий Фонтан', 'CITY', 46.3947, 30.746),
  odesa('chornomorka', 'Чорноморка', 'CITY', 46.3557, 30.7038),

  // ─── Одеса: передмістя ───
  // Окремого міста в довіднику для них немає: людина з Фонтанки обирає
  // Одесу й свій населений пункт, а майстри з міста бачать заявку в
  // дальньому кільці, а не не бачать зовсім.
  odesa('pivdenne', 'Південне', 'SUBURB', 46.6225, 31.0995),
  odesa('dachne', 'Дачне', 'SUBURB', 46.5772, 30.5482),
  odesa('fontanka', 'Фонтанка', 'SUBURB', 46.5702, 30.8581),
  odesa('kryzhanivka', 'Крижанівка', 'SUBURB', 46.5621, 30.792),
  odesa('nerubaiske', 'Нерубайське', 'SUBURB', 46.5446, 30.6298),
  odesa('usatove', 'Усатове', 'SUBURB', 46.5374, 30.6543),
  odesa('khlibodarske', 'Хлібодарське', 'SUBURB', 46.4828, 30.5911),
  odesa('avanhard', 'Авангард', 'SUBURB', 46.4711, 30.6138),
  odesa('prylymanske', 'Прилиманське', 'SUBURB', 46.4251, 30.6126),
  odesa('lymanka', 'Лиманка', 'SUBURB', 46.3731, 30.6909),
  odesa('tairove', 'Таїрове', 'SUBURB', 46.3672, 30.6513),
  odesa('velykodolynske', 'Великодолинське', 'SUBURB', 46.3467, 30.576),
  odesa('sovinon', 'Совіньйон', 'SUBURB', 46.3364, 30.6813),
  odesa('chornomorsk', 'Чорноморськ', 'SUBURB', 46.3013, 30.6549),
]
