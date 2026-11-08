// Реакції на повідомлення — спільні для сервера й браузера.
//
// Набір закритий: сервер приймає лише ці емодзі, інакше в базу (і в
// чужий чат через Pusher) їхав би будь-який рядок з тіла запиту.
//
// Одна реакція від людини на повідомлення, як у Telegram без Premium:
// інша замінює попередню, та сама — знімає. Так менше шуму в розмові
// двох людей, і рахувати нема чого — видно, хто що поставив.

/** Порядок — як у смужці над меню повідомлення. Перша — «швидка» (подвійний клік). */
export const REACTIONS = [
  '❤️',
  '👍',
  '😂',
  '😮',
  '😢',
  '🙏',
  '🔥',
  '👏',
] as const

export type Reaction = (typeof REACTIONS)[number]

/** Подвійний клік / дотик по повідомленню. */
export const QUICK_REACTION: Reaction = REACTIONS[0]

export function isReaction(v: unknown): v is Reaction {
  return typeof v === 'string' && (REACTIONS as readonly string[]).includes(v)
}

/** Реакції повідомлення, згруповані за емодзі: хто поставив. */
export interface ReactionGroup {
  emoji: string
  userIds: string[]
}

interface ReactionRow {
  emoji: string
  userId: string
}

/**
 * Рядки з бази → групи в порядку першої появи (рядки мають іти за
 * createdAt). Невідомі емодзі відкидаються: набір могли звузити, а старі
 * рядки лишились.
 */
export function groupReactions(
  rows: readonly ReactionRow[] | null | undefined,
): ReactionGroup[] {
  const groups: ReactionGroup[] = []
  for (const r of rows ?? []) {
    if (!isReaction(r.emoji)) continue
    const group = groups.find((g) => g.emoji === r.emoji)
    if (group) group.userIds.push(r.userId)
    else groups.push({ emoji: r.emoji, userIds: [r.userId] })
  }
  return groups
}

/** Що поставив цей користувач (null — нічого). */
export function myReaction(
  groups: readonly ReactionGroup[],
  userId: string,
): string | null {
  return groups.find((g) => g.userIds.includes(userId))?.emoji ?? null
}

/**
 * Нова реакція після натиску на емодзі: та сама — знімає, інша —
 * замінює. null — реакції не лишилось. Те саме правило й на сервері:
 * він ставить рівно те, що прийшло.
 */
export function nextReaction(
  groups: readonly ReactionGroup[],
  userId: string,
  emoji: string,
): string | null {
  return myReaction(groups, userId) === emoji ? null : emoji
}

/**
 * Групи після того, як користувач поставив `emoji` (або зняв — null).
 * Для оптимістичного оновлення: сервер потім пришле точний стан.
 */
export function applyReaction(
  groups: readonly ReactionGroup[],
  userId: string,
  emoji: string | null,
): ReactionGroup[] {
  const without = groups
    .map((g) => ({ ...g, userIds: g.userIds.filter((id) => id !== userId) }))
    .filter((g) => g.userIds.length > 0)
  if (!emoji) return without

  const existing = without.find((g) => g.emoji === emoji)
  if (existing) {
    return without.map((g) =>
      g.emoji === emoji ? { ...g, userIds: [...g.userIds, userId] } : g,
    )
  }
  return [...without, { emoji, userIds: [userId] }]
}
