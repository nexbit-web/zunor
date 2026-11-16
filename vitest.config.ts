import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'node:url'

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

// * два проєкти: server (node, без .svelte) і components (jsdom, browser:
// * true). Обидва без плагіна sveltekit(): віртуальні модулі ($env/*, $app/*)
// * підмінені заглушками з src/tests/mocks. Усі тести — у src/tests/

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

// * масив, а не об'єкт: порядок пошуку тут значущий — $lib має стояти
// * після точних збігів, інакше він перехопив би все
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
          // * configFile: false — секцію kit цей плагін без sveltekit() не розуміє;
          // * режим рун відтворюємо тим самим правилом
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
          // * без 'browser' підтягнулась би серверна збірка svelte і
          // * компоненти не змонтувались би зовсім
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
