import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'node:url'

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

// Два проєкти в одному конфізі: `server` і `components`. Розділені вони не
// заради краси — у них несумісні вимоги:
//
//   • server: node-оточення, browser: false, без компіляції .svelte. Так
//     швидше й так чесніше — серверний код у браузер не потрапляє.
//   • components: jsdom, browser: true, з плагіном svelte. Компонент без
//     DOM не змонтуєш, а половина клієнтської логіки схована за
//     `if (browser)` — з browser: false тест дивився б на мертву гілку.
//
// Обидва проєкти працюють БЕЗ плагіна sveltekit(): повний SvelteKit-пайплайн
// додав би залежність від .svelte-kit і підняття dev-сервера на кожен прогін.
// Замість нього віртуальні модулі ($env/*, $app/*) підмінені заглушками з
// src/tests/mocks — цього досить, щоб імпортувати і серверні модулі, і самі
// роути, і компоненти. Значення в заглушках фальшиві, справжніх секретів у
// репозиторії немає.
//
// Усі тести живуть в одній теці src/tests/ — include навмисно вужчий за
// src/**, щоб *.test.ts поруч із кодом не з'являлися непомітно й набір не
// розповзався знову. Тека всередині src/ (а не в корені), бо svelte-check
// перевіряє саме src/**: інакше типи в тестах ніхто б не читав.

/** $env/* однакові для обох проєктів. */
const envAliases = [
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
]

// Масив, а не об'єкт: порядок пошуку тут значущий — $lib має стояти
// після точних збігів, інакше він перехопив би все.
const libAlias = { find: '$lib', replacement: at('./src/lib') }

export default defineConfig({
  test: {
    projects: [
      {
        resolve: {
          alias: [
            ...envAliases,
            {
              find: '$app/environment',
              replacement: at('./src/tests/mocks/app-environment.ts'),
            },
            libAlias,
          ],
        },
        test: {
          name: 'server',
          include: ['src/tests/**/*.test.ts'],
          exclude: ['src/tests/components/**'],
          environment: 'node',
        },
      },
      {
        plugins: [
          // configFile: false — svelte.config.js тягне за собою секцію kit,
          // яку цей плагін без sveltekit() не розуміє. Режим рун
          // відтворюємо тим самим правилом, що й у справжньому конфізі:
          // примусово для свого коду, як є для бібліотек із node_modules.
          svelte({
            configFile: false,
            compilerOptions: {
              runes: ({ filename }: { filename: string }) =>
                filename.split(/[/\\]/).includes('node_modules')
                  ? undefined
                  : true,
            },
          }),
        ],
        resolve: {
          // Без 'browser' підтягнулась би серверна збірка svelte і
          // компоненти не змонтувались би зовсім.
          conditions: ['browser'],
          alias: [
            ...envAliases,
            {
              find: '$app/environment',
              replacement: at('./src/tests/mocks/app-environment-browser.ts'),
            },
            {
              find: '$app/navigation',
              replacement: at('./src/tests/mocks/app-navigation.ts'),
            },
            {
              find: '$app/state',
              replacement: at('./src/tests/mocks/app-state.svelte.ts'),
            },
            {
              find: '$app/stores',
              replacement: at('./src/tests/mocks/app-state.svelte.ts'),
            },
            libAlias,
          ],
        },
        test: {
          name: 'components',
          include: ['src/tests/components/**/*.test.ts'],
          environment: 'jsdom',
          setupFiles: ['./src/tests/components/setup.ts'],
        },
      },
    ],
  },
})
