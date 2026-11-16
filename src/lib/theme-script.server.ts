// Скрипт mode-watcher, що ставить тему до першого кадру.
//
// Компонент <ModeWatcher> вставляв би його в <head> сам, але без nonce — а
// CSP (svelte.config.js) вбудованих скриптів без nonce не виконує. Тому
// текст скрипта підставляється в app.html, у тег із nonce сторінки
// (`%modewatcher.snippet%`; заміну робить hooks.server.ts), а в компоненті
// вставка вимкнена (disableHeadScriptInjection у кореневому layout).
//
// darkClassNames порожній — як і в <ModeWatcher>: клас `dark` ставить
// кореневий layout, і лише в кабінеті.
//
// Окремий модуль, а не рядок у hooks.server.ts: mode-watcher — бібліотека
// компонентів, і серверні тести її не збирають — вони підміняють цей файл.
// Лежить поза lib/server навмисно: ту теку цілком копіює бекенд на Hono
// (backend/scripts/sync-from-web.mjs), а йому ні сторінки, ні теми не
// потрібні. Суфікс .server не дає імпортувати файл у браузерний код.

import { createInitialModeExpression } from 'mode-watcher'

export const MODE_SNIPPET = createInitialModeExpression({ darkClassNames: [] })
