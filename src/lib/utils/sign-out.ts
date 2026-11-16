// * вихід з акаунта — один шлях для всіх кнопок «Вийти» (меню шапки,
// * налаштування, адмінка). Тост і стан кнопки — справа того, хто кличе:
// * тут лише сама послідовність, і порядок у ній важливий

import { goto } from '$app/navigation'
import { signOut } from '$lib/auth-client'
import { disconnectPusher } from '$lib/pusher-client'
import { chatStore } from '$lib/stores/chat-store.svelte'

/** Виходить і веде на `to`. Кидає, якщо сервер вихід не прийняв. */
export async function signOutAndGo(to = '/'): Promise<void> {
  // * спершу рвемо реалтайм: інакше лишиться відкритий сокет на канал
  // * користувача, якого вже немає в сесії
  chatStore.unsubscribeAll()
  disconnectPusher()

  const { error } = await signOut()
  if (error) throw new Error(error.message ?? 'sign-out failed')

  // * одразу перехід із перезавантаженням даних нової сторінки: окремий
  // * invalidateAll() перечитував би поточну, а вона може бути за замком.
  // * replaceState — щоб «Назад» не вертав туди, куди без сесії не зайти
  await goto(to, { invalidateAll: true, replaceState: true })
}
