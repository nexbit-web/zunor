import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Навмисно БЕЗ плагіна sveltekit(): тестуємо лише чисте ядро (scoring,
// state machine, валідація, санітизація, детект послуги) — модулі без
// звернень до БД, мережі й $env. Достатньо резолву аліаса $lib, а повний
// SvelteKit-пайплайн у тестах тільки додав би залежність від .svelte-kit.
//
// Якщо колись знадобиться тестувати .svelte-компоненти — це буде окремий
// конфіг з sveltekit() і browser/jsdom-оточенням.
export default defineConfig({
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
