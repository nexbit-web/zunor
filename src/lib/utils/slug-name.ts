interface Named {
  slug: string
  name: string
}

// * довідники (міста, категорії) лежать у кеші списком — назву беремо звідти,
// * а не окремим запитом; запису немає в довіднику — показуємо сам slug
export function nameBySlug(
  rows: readonly Named[],
  slug: string | null | undefined,
): string | undefined {
  if (!slug) return undefined
  return rows.find((row) => row.slug === slug)?.name ?? slug
}
