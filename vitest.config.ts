import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

// Навмисно БЕЗ плагіна sveltekit(): повний SvelteKit-пайплайн у тестах додав
// би залежність від .svelte-kit і підняття vite-dev-сервера на кожен прогін.
// Замість цього віртуальні модулі SvelteKit підмінені заглушками нижче —
// цього досить, щоб імпортувати серверні модулі й самі роути (+server.ts).
//
// $env/* і $app/environment існують тільки всередині SvelteKit-збірки. Без
// заглушок будь-який імпорт, що тягне prisma/auth/pusher, падав би ще на
// етапі резолву — тобто протестувати роут було б неможливо в принципі.
// Значення в заглушках фальшиві, справжніх секретів у репозиторії немає.
//
// Усі тести живуть в одній теці src/tests/ — include навмисно вужчий за
// src/**, щоб *.test.ts поруч із кодом не з'являлися непомітно й набір не
// розповзався знову. Тека всередині src/ (а не в корені), бо svelte-check
// перевіряє саме src/**: інакше типи в тестах ніхто б не читав.
//
// Якщо колись знадобиться тестувати .svelte-компоненти — це буде окремий
// конфіг з sveltekit() і browser/jsdom-оточенням.
export default defineConfig({
  resolve: {
    // Масив, а не об'єкт: порядок пошуку тут значущий — $lib має стояти
    // після точних збігів, інакше він перехопив би все.
    alias: [
      {
        find: '$env/static/private',
        replacement: at('./src/tests/mocks/env-static-private.ts'),
      },
      {
        find: '$env/static/public',
        replacement: at('./src/tests/mocks/env-static-public.ts'),
      },
      {
        find: '$env/dynamic/private',
        replacement: at('./src/tests/mocks/env-dynamic-private.ts'),
      },
      {
        find: '$env/dynamic/public',
        replacement: at('./src/tests/mocks/env-dynamic-public.ts'),
      },
      {
        find: '$app/environment',
        replacement: at('./src/tests/mocks/app-environment.ts'),
      },
      { find: '$lib', replacement: at('./src/lib') },
    ],
  },
  test: {
    include: ['src/tests/**/*.test.ts'],
    environment: 'node',
  },
})
