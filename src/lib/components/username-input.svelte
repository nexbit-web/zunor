<script lang="ts">
  import { Input } from '$lib/components/ui/input'
  import { Spinner } from '$lib/components/ui/spinner'
  import CheckIcon from '@lucide/svelte/icons/check'
  import CircleAlertIcon from '@lucide/svelte/icons/circle-alert'
  import { AtSign } from 'lucide-svelte'
  import { cn } from '$lib/utils'
  import { validateUsername } from '$lib/username'

  let {
    value = $bindable(''),
    isValid = $bindable<boolean | null>(null),
    currentUsername = '',
    touched = $bindable(false),
  }: {
    value: string
    isValid?: boolean | null
    currentUsername?: string
    /**
     * Поле вже «чіпали»: пішли з нього або натиснули «Надіслати».
     * Двостороннє, бо форма мусить увімкнути помилку на сабміті —
     * інакше порожній username лишається білим, а кнопка мовчки
     * не спрацьовує.
     */
    touched?: boolean
  } = $props()

  let checking = $state(false)
  let available = $state<boolean | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  // Формат + зарезервовані — за єдиним правилом із $lib/username.
  const check = $derived(validateUsername(value))
  const formatOk = $derived(check.ok)
  const reserved = $derived(!check.ok && check.reason === 'reserved')

  // Текст помилки рахуємо один раз: доки він жив двома гілками в
  // розмітці, рамка поля й підпис під ним вмикались за різними умовами,
  // і поле лишалось звичайним там, де підпис уже червонів.
  // Помилку формату показуємо лише після виходу з поля: червоне на
  // першій же набраній літері — це зауваження людині, яка ще друкує.
  // «Вже зайнято» — інша річ: це відповідь сервера, а не докір.
  const errorText = $derived(
    touched && !value
      ? 'Введіть username'
      : touched && !formatOk
        ? reserved
          ? 'Цей username зарезервовано'
          : '3-20 символів, починається з літери (a-z, 0-9, _)'
        : available === false
          ? 'Цей username вже зайнято'
          : '',
  )

  $effect(() => {
    void value // переобчислюємо при кожній зміні поля
    if (timer) clearTimeout(timer)
    available = null
    isValid = null

    if (!check.ok) return
    // Власний поточний username вважаємо вільним (редагування без зміни).
    if (check.value === currentUsername) {
      available = true
      isValid = true
      return
    }

    checking = true
    timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/user/username/check?username=${encodeURIComponent(check.value)}`,
        )
        const json = await res.json()
        available = json.available === true
        isValid = available
      } catch {
        available = null
        isValid = null
      } finally {
        checking = false
      }
    }, 400)

    // Прибирання за собою: без нього таймер переживає демонтування, і
    // піти з форми, не дочекавшись 400 мс, означало запит для компонента,
    // якого вже немає. $effect із таймером мусить його ж і знімати.
    return () => {
      if (timer) clearTimeout(timer)
    }
  })
</script>

<!-- Лише контрол, без власного підпису й опису: підпис «Username» дає
     поле форми (SettingsField), а адреса профілю живе в його підказці.
     Коли підпис і опис були ще й тут, форма показувала «Username» двічі
     й двічі пояснювала, що це адреса профілю. -->
<div>
  <div class="relative">
    <Input
      id="username"
      type="text"
      icon={AtSign}
      placeholder="oleksandr_master"
      bind:value
      maxlength={20}
      onblur={() => (touched = true)}
      aria-invalid={!!errorText}
      class={cn('pr-9', errorText && 'border-destructive')}
      oninput={() => {
        value = value.toLowerCase().replace(/[^a-z0-9_]/g, '')
      }}
    />
    <span class="absolute top-1/2 right-3 -translate-y-1/2">
      {#if checking}
        <Spinner class="size-4 text-muted-foreground" />
      {:else if available === true}
        <CheckIcon class="size-4" style="color: #10b981" />
      {:else if errorText}
        <CircleAlertIcon class="size-4 text-destructive" />
      {/if}
    </span>
  </div>
  {#if errorText}
    <!-- Той самий рядок помилки, що й у решті полів: іконка плюс текст
         звичайною вагою. -->
    <p
      class="mt-1.5 flex items-center gap-1.5 text-[12px] text-destructive"
      role="alert"
    >
      <CircleAlertIcon class="size-3.5 shrink-0" aria-hidden="true" />
      {errorText}
    </p>
  {/if}
</div>
