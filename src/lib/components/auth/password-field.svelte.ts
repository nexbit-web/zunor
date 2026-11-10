import { getContext, setContext } from 'svelte'

// Стан поля пароля для знака над формою: поле живе у формі, знак — у
// шапці AuthShell, і сторінці не треба тягати стан між ними. Одне поле
// пароля на рамку — більше на наших екранах і немає.

export class PasswordFieldState {
  visible = $state(false)
  #read = $state.raw<() => string>(() => '')

  /** У полі вже щось введено. Фокус не важить: знак грається з паролем. */
  get filled(): boolean {
    return this.#read().length > 0
  }

  /** Поле віддає своє значення — читаємо його напряму, без копії. */
  connect(read: () => string): void {
    this.#read = read
  }
}

const KEY = Symbol('password-field')

export function providePasswordField(): PasswordFieldState {
  return setContext(KEY, new PasswordFieldState())
}

/** Стан рамки; поза AuthShell — власний, тож поле працює будь-де. */
export function usePasswordField(): PasswordFieldState {
  return (
    getContext<PasswordFieldState | undefined>(KEY) ?? new PasswordFieldState()
  )
}
