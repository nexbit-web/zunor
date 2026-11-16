// * скрипт mode-watcher, що ставить тему до першого кадру. Підставляється в
// * app.html у тег із nonce сторінки: CSP не виконує вбудованих скриптів без
// * nonce. Лежить поза lib/server: ту теку цілком копіює бекенд

import { createInitialModeExpression } from 'mode-watcher'

export const MODE_SNIPPET = createInitialModeExpression({ darkClassNames: [] })
