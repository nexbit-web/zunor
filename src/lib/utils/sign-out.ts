// Вихід з акаунта — один шлях для всіх кнопок «Вийти» (меню шапки,
// налаштування, адмінка). Тост і стан кнопки — справа того, хто кличе:
// тут лише сама послідовність, і порядок у ній важливий.

import { goto } from '$app/navigation'
import { signOut } from '$lib/auth-client'
import { disconnectPusher } from '$lib/pusher-client'
import { chatStore } from '$lib/stores/chat-store.svelte'

/** Виходить і веде на `to`. Кидає, якщо сервер вихід не прийняв. */
export async function signOutAndGo(to = '/'): Promise<void> {
  // Спершу рвемо реалтайм: інакше лишиться відкритий сокет на канал
  // користувача, якого вже немає в сесії.
  chatStore.unsubscribeAll()
  disconnectPusher()

  const { error } = await signOut()
  if (error) throw new Error(error.message ?? 'sign-out failed')

  // Одразу перехід із перезавантаженням даних — для НОВОЇ сторінки. Окремий
  // invalidateAll() перед ним перечитував би ПОТОЧНУ, а вона могла бути
  // за замком: адмінка без сесії відповідає 404, і людина лишалась на
  // сторінці помилки замість головної. replaceState — щоб «Назад» не
  // вертав на сторінку, якої без сесії вже не відкрити.
  await goto(to, { invalidateAll: true, replaceState: true })
}
