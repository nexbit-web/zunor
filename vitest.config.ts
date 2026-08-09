import { defineConfig, type Plugin } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

/**
 * Підміна бочки lucide-svelte однією заглушкою.
 *
 * Причина суто механічна: бочка реекспортує ~1700 окремих .svelte-іконок, і
 * SSR-трансформ vite не робить tree-shaking — тобто КОЖЕН файл тестів, що
 * імпортує хоч одну іконку, тягнув компіляцію всіх. Один такий файл ішов
 * понад хвилину; з заглушкою — секунди.
 *
 * Ціна: компонентний тест не може перевірити, ЯКА саме іконка намальована.
 * Це прийнятно — іконка не має поведінки, а підпис поруч однаково важливіший
 * і перевіряється текстом. Пер-іконні шляхи (`@lucide/svelte/icons/check`)
 * плагін не чіпає: вони й так дешеві.
 */
function lucideStub(): Plugin {
  const VIRTUAL = '\0lucide-stub'
  const STUB = at('./src/tests/mocks/icon-stub.svelte')

  /**
   * Імена з `default as X` у файлі пакета. Регекс навмисно не вимагає
   * `export {` в тому ж рядку: файли аліасів переносять реекспорт на два
   * рядки, і суворіший шаблон мовчки пропускав половину імен (AlertCircle
   * і решта feather-сумісних).
   */
  const namesFrom = (rel: string): string[] => {
    try {
      const src = readFileSync(at(rel), 'utf8')
      return [...src.matchAll(/default as (\w+)/g)].map((m) => m[1])
    } catch {
      return []
    }
  }

  return {
    name: 'zunor:lucide-stub',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'lucide-svelte' || id === 'lucide-svelte/icons') return VIRTUAL
      if (id === VIRTUAL) return VIRTUAL
      return null
    },
    load(id) {
      if (id !== VIRTUAL) return null

      const names = new Set([
        ...namesFrom('./node_modules/lucide-svelte/dist/icons/index.js'),
        ...namesFrom('./node_modules/lucide-svelte/dist/aliases/aliases.js'),
        ...namesFrom('./node_modules/lucide-svelte/dist/aliases/prefixed.js'),
        ...namesFrom('./node_modules/lucide-svelte/dist/aliases/suffixed.js'),
        'Icon',
        'defaultAttributes',
      ])

      return [
        `import Stub from ${JSON.stringify(STUB)}`,
        [...names].map((n) => `export const ${n} = Stub`).join('\n'),
        'export const icons = {}',
        'export default Stub',
      ].join('\n')
    },
  }
}

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
          lucideStub(),
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
