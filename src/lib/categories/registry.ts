// src/lib/categories/registry.ts
//
// Універсальний реєстр категорій із метаданими (банер тощо).
// Щоб додати нову категорію — додай запис тут і поклади файл у static/banners/.
//
// slug — той самий, що в БД (Category.slug).

export interface CategoryMeta {
  banner: string // шлях до банера (з /)
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  prybyrannya: {
    banner: '/banners/web-development.gif', // тестовий, замінити на cleaning.webp
  },
}

// Дефолтний банер, якщо для категорії немає запису (новачок без чіткої категорії)
export const DEFAULT_BANNER = '/banners/web-development.gif'

/**
 * Повертає шлях до банера для категорії.
 * Якщо у мастера кілька категорій — беремо першу.
 * Якщо категорія невідома — дефолтний банер.
 */
export function getBannerForCategories(categories: string[]): string {
  for (const slug of categories) {
    const meta = CATEGORY_META[slug]
    if (meta) return meta.banner
  }
  return DEFAULT_BANNER
}
