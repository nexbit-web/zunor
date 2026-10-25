import { Palette, Sparkles, Bell, Shield, UserRound } from 'lucide-svelte'

export type SettingsGroupId = 'account' | 'app'

export interface SettingsSection {
  slug: string
  label: string
  icon: typeof Bell
  /** Підзаголовок у меню налаштувань, під яким стоїть пункт. */
  group: SettingsGroupId
  /** Кому показувати. Порожньо — усім. */
  roles?: readonly ('CLIENT' | 'MASTER')[]
}

// Порядок груп у меню. Іконки одноколірні, без кольорових плиток: плитки
// перетягували увагу з назв, а колір у застосунку тепер означає одне —
// обраний акцент.
export const SETTINGS_GROUPS: readonly {
  id: SettingsGroupId
  label: string
}[] = [
  { id: 'account', label: 'Акаунт' },
  { id: 'app', label: 'Застосунок' },
]

// «Вийти» тут немає: це дія, а не розділ, і вона стоїть унизу меню
// налаштувань окремо від решти пунктів.
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { slug: 'profile', label: 'Профіль', icon: UserRound, group: 'account' },
  { slug: 'security', label: 'Безпека', icon: Shield, group: 'account' },
  {
    slug: 'notifications',
    label: 'Сповіщення',
    icon: Bell,
    group: 'account',
  },
  { slug: 'appearance', label: 'Вигляд', icon: Palette, group: 'app' },
  {
    slug: 'assistant',
    label: 'AI асистент',
    icon: Sparkles,
    group: 'app',
    // Анкета впливає на діалог створення заявки — майстер їх не створює.
    roles: ['CLIENT'],
  },
]

export function sectionsForRole(
  role: string | null,
): readonly SettingsSection[] {
  return SETTINGS_SECTIONS.filter(
    (s) => !s.roles || s.roles.includes(role as 'CLIENT' | 'MASTER'),
  )
}

export const DEFAULT_SECTION = SETTINGS_SECTIONS[0].slug
