// Заглушка для $env/static/private у тестах.
//
// SvelteKit генерує цей модуль зі справжнього .env під час збірки, а vitest
// працює без SvelteKit-пайплайна (див. коментар у vitest.config.ts). Значення
// тут навмисно фальшиві й безпечні: жоден тест не ходить у справжню базу,
// SMTP чи DeepSeek — уся інфраструктура замокана.
//
// ЖОДНОГО справжнього секрету тут бути не може: файл лежить у репозиторії.

export const DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
export const BETTER_AUTH_URL = 'http://localhost:5173'
export const BETTER_AUTH_SECRET = 'test-secret-not-used'
export const GOOGLE_CLIENT_ID = 'test-google-id'
export const GOOGLE_CLIENT_SECRET = 'test-google-secret'
export const CRON_SECRET = 'test-cron-secret'
export const DEEPSEEK_API_KEY = 'test-deepseek-key'
export const SMTP_HOST = 'localhost'
export const SMTP_PORT = '587'
export const SMTP_USER = 'test'
export const SMTP_PASS = 'test'
export const SMTP_FROM = 'test@example.com'
