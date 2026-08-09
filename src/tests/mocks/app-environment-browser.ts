// $app/environment для компонентних тестів.
//
// Відрізняється від серверної заглушки одним прапорцем — і саме він тут
// принциповий: browser: true. Половина клієнтського коду захищена
// `if (browser)` (підписка на Pusher, читання localStorage, синхронізація
// SSR-значення зі стором), і з browser: false тест перевіряв би мертву
// гілку, а не те, що бачить користувач.

export const browser = true
export const dev = false
export const building = false
export const version = 'test'
