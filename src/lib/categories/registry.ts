// * реєстр категорій із метаданими. Нова категорія — запис тут і банер у
// * static/banners/. slug — той самий, що в базі

export interface CategoryMeta {
  /** Шлях до банера (з /) — запасний формат, його читають усі браузери. */
  banner: string
  /** Той самий банер в AVIF: браузер бере його, якщо вміє, інакше `banner`. */
  bannerAvif?: string
}

/** Банер для сторінки: `avif` — у <source>, `src` — у <img>. */
export interface Banner {
  src: string
  avif: string | null
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  prybyrannya: {
    // * 1800×520, важливе по центру: краї обрізаються, лівий нижній кут закриває аватар
    banner: '/banners/cleaning-living-room.webp',
    bannerAvif: '/banners/cleaning-living-room.avif',
  },
}

// * дефолтний банер, якщо для категорії немає запису (новачок без чіткої категорії)
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
