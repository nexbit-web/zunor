// Заглушка для $app/environment.
//
// browser: false — код виконується в node-оточенні тестів.
// building: true — цим прапорцем account-cache вимикає підписку на Pusher,
// тобто імпорт модуля не відкриває мережеве з'єднання в кожному тесті.

export const browser = false
export const dev = false
export const building = true
export const version = 'test'
