// Універсальний реєстр категорій із метаданими (банер тощо).
// Щоб додати нову категорію — додай запис тут і поклади файл у static/banners/.
//
// slug — той самий, що в БД (Category.slug).

export interface CategoryMeta {
  /** Шлях до банера (з /) — запасний формат, його читають усі браузери. */
  banner: string
  /**
   * Той самий банер в AVIF — удвічі легший за WebP за тієї ж якості.
   * Браузер бере його, якщо вміє (Safari — з iOS 16.4), інакше `banner`.
   * У застосунку — лише WebP (Metro AVIF не бере, старі Android можуть не
   * показати).
   */
  bannerAvif?: string
}

/** Банер для сторінки: `avif` — у <source>, `src` — у <img>. */
export interface Banner {
  src: string
  avif: string | null
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  prybyrannya: {
    // 1800×520 (≈3,5 : 1): ілюстрація «прибирання у затишній вітальні»,
    // сині підведені під фірмовий #1f6feb. Важливе — по центру: краї
    // обрізаються (телефон — з боків, вузьке вікно — згори й знизу), лівий
    // нижній кут закриває аватар. Копія — mobile/assets/images/banners.
    banner: '/banners/cleaning-living-room.webp',
    bannerAvif: '/banners/cleaning-living-room.avif',
  },
}

// Дефолтний банер, якщо для категорії немає запису (новачок без чіткої категорії)
export const DEFAULT_BANNER = '/banners/web-development.gif'

/**
 * Банер для категорії.
 * Якщо у мастера кілька категорій — беремо першу, що має банер.
 * Якщо категорія невідома — дефолтний банер.
 */
export function getBannerForCategories(categories: string[]): Banner {
  for (const slug of categories) {
    const meta = CATEGORY_META[slug]
    if (meta) return { src: meta.banner, avif: meta.bannerAvif ?? null }
  }
  return { src: DEFAULT_BANNER, avif: null }
}
