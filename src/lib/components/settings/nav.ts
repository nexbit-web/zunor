import { Palette, Sparkles, Bell, Shield, LogOut } from 'lucide-svelte'

export interface SettingsSection {
  slug: string
  label: string
  icon: typeof Bell
  tile: string
  /** Кому показувати. Порожньо — усім. */
  roles?: readonly ('CLIENT' | 'MASTER')[]
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { slug: 'appearance', label: 'Вигляд', icon: Palette, tile: 'bg-violet-500' },
  {
    slug: 'assistant',
    label: 'AI асистент',
    icon: Sparkles,
    tile: 'bg-primary',
    // Анкета впливає на діалог створення заявки — майстер їх не створює.
    roles: ['CLIENT'],
  },
  {
    slug: 'notifications',
    label: 'Сповіщення',
    icon: Bell,
    tile: 'bg-red-500',
  },
  { slug: 'security', label: 'Безпека', icon: Shield, tile: 'bg-emerald-600' },
  { slug: 'account', label: 'Акаунт', icon: LogOut, tile: 'bg-zinc-500' },
]

export function sectionsForRole(
  role: string | null,
): readonly SettingsSection[] {
  return SETTINGS_SECTIONS.filter(
    (s) => !s.roles || s.roles.includes(role as 'CLIENT' | 'MASTER'),
  )
}

export const DEFAULT_SECTION = SETTINGS_SECTIONS[0].slug
