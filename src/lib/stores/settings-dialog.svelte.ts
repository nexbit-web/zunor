import { DEFAULT_SECTION } from '$lib/components/settings/nav'

// Стан модалки налаштувань. Живе в сторі, а не в URL: налаштування —
// це шар ПОВЕРХ того, чим користувач зараз зайнятий (так само в ChatGPT
// і Claude), і закриття має повертати рівно на те місце, а не «кудись
// назад по історії».
//
// Імпорт саме з './nav', а не з бареля $lib/components/settings: барель
// реекспортує .svelte-компоненти, і стор потягнув би за собою весь UI.
class SettingsDialog {
  open = $state(false)
  slug = $state<string>(DEFAULT_SECTION)

  show(slug: string = DEFAULT_SECTION): void {
    this.slug = slug
    this.open = true
  }

  hide(): void {
    this.open = false
  }
}

export const settingsDialog = new SettingsDialog()
