// * короткий набір емодзі під наші розмови, а не весь Unicode. Лише до версії
// * 12: Windows 10 новіших не малює

export interface EmojiGroup {
  title: string
  emoji: string[]
}

// Групи по 8 у ряд — рівна сітка без хвостів.
// prettier-ignore
export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    title: 'Смайли',
    emoji: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
      '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😋',
      '😜', '🤪', '😎', '🥳', '😏', '😌', '🤗', '🤭',
      '🤔', '🤨', '😐', '🙄', '😬', '😴', '🥺', '😢',
      '😭', '😤', '😠', '😱', '😳', '🤯', '😮', '🤧',
    ],
  },
  {
    title: 'Жести',
    emoji: [
      '👍', '👎', '👌', '✌️', '🤞', '🤙', '👋', '👏',
      '🙌', '🙏', '🤝', '💪', '👀', '☝️', '👉', '✊',
    ],
  },
  {
    title: 'Серця й символи',
    emoji: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
      '💯', '🔥', '✨', '⭐', '🎉', '🎁', '✅', '❌',
      '⚠️', '❗', '❓', '💬', '📌', '👑', '🌞', '🌧️',
    ],
  },
  {
    title: 'Дім і прибирання',
    emoji: [
      '🏠', '🏡', '🏢', '🏬', '🧹', '🧽', '🧼', '🧺',
      '🧴', '🧤', '🚪', '🛁', '🚿', '🚽', '🛏️', '🛋️',
      '🍳', '🍽️', '🌿', '🌸', '🐶', '🐱', '🔑', '🗑️',
    ],
  },
  {
    title: 'Справи',
    emoji: [
      '⏰', '📅', '🕐', '📍', '🚗', '🚕', '📞', '📷',
      '💰', '💳', '🧾', '📝', '📦', '⏳', '☕', '🍰',
    ],
  },
]

const KNOWN = new Set(EMOJI_GROUPS.flatMap((g) => g.emoji))

// Як у Telegram: що ставив останнім, те й першим рядом. Живе в
// localStorage — це зручність одного браузера, а не дані.

const KEY = 'zunor-recent-emoji'
export const RECENT_MAX = 16

/** Новий список нещодавніх: обраний — першим, без повторів, зі стелею. */
export function withRecent(list: string[], emoji: string): string[] {
  return [emoji, ...list.filter((e) => e !== emoji)].slice(0, RECENT_MAX)
}

export function recentEmoji(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    // * лише з нашого набору: сховище міг змінити будь-хто
    return raw
      .filter((e): e is string => typeof e === 'string' && KNOWN.has(e))
      .slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

export function rememberEmoji(emoji: string): void {
  if (!KNOWN.has(emoji)) return
  try {
    localStorage.setItem(KEY, JSON.stringify(withRecent(recentEmoji(), emoji)))
  } catch {
    // * приватне вікно чи заблоковане сховище — просто без «нещодавніх»
  }
}
