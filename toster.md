# Toast — документація

Лёгкий фронтовый тостер в стиле Claude. Состояние — в сторе, вид — один `<Toaster>` в layout.

## Установка (один раз)

`src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import { Toaster } from '$lib/components/toast'
</script>

<Toaster position="top-center" />
```

`position` — позиция по умолчанию для всех тостов.

## Вызов (из любого фронт-кода)

```ts
import { toast } from '$lib/stores/toast-store.svelte'
```

```ts
toast.success('Замовлення створено')
toast.error('Не вдалося зберегти')
toast.warning('Перевір з’єднання')
toast.info('Майстер відповів')
toast('Просте повідомлення')        // тип default
```

## Опции

Второй аргумент — объект, все поля необязательны:

| Поле | Тип | По умолчанию | Что делает |
|---|---|---|---|
| `duration` | `number` (мс) | success 4000 / error 5000 / warning,info 6000 / default 4000 | Время до авто-закрытия. `0` = висит, пока не закроют. |
| `position` | `ToastPosition` | из `<Toaster>` | Позиция только этого тоста. |
| `action` | `{ label, onClick? }` | — | Кнопка-действие в тексте. |

`position`: `top-left` · `top-center` · `top-right` · `bottom-left` · `bottom-center` · `bottom-right`.

```ts
// своя позиция и время
toast.success('Готово!', { position: 'bottom-center', duration: 2000 })

// persistent + кнопка
toast.warning('Цей чат задовгий.', {
  duration: 0,
  action: {
    label: 'Новий чат',
    onClick: (id) => {
      goto('/jobs/new')
      toast.dismiss(id)   // persistent — закрываем вручную
    },
  },
})
```

## Управление

```ts
const id = toast.info('Завантажую…', { duration: 0 })
toast.dismiss(id)     // закрыть конкретный
toast.dismissAll()    // закрыть все
```

Каждый метод возвращает `id` (string) — пригодится для `dismiss`.

## Поведение

- Наведение мышью ставит таймер и прогресс-бар на паузу, увод — продолжает с остатка.
- Несколько тостов складываются в стопку; нижние позиции растут от края вверх.
- Прогресс-бар — чистый CSS, во время отсчёта JS не работает.

## Правила

- **Только клиент.** Зови `toast.*` в обработчиках, `onMount`, `$effect`. На сервере (`load`, actions) — no-op. Чтобы показать серверное сообщение: верни безопасный текст из эндпоинта и вызови `toast.error(текст)` на клиенте.
- **Текст, не HTML.** `message` экранируется — разметку и пользовательский ввод вставлять безопасно, XSS не будет.
- **Длинные сообщения** переносятся по словам; держи текст коротким.

## Типы (для TS)

```ts
import type {
  ToastType,       // 'success' | 'error' | 'warning' | 'info' | 'default'
  ToastPosition,
  ToastOptions,
  ToastAction,
} from '$lib/stores/toast-store.svelte'
```
