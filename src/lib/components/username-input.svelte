<script lang="ts">
  import { Input } from '$lib/components/ui/input'
  import * as Field from '$lib/components/ui/field'
  import { Spinner } from '$lib/components/ui/spinner'
  import CheckIcon from '@lucide/svelte/icons/check'
  import XCircleIcon from '@lucide/svelte/icons/x-circle'
  import { cn } from '$lib/utils'
  import { validateUsername } from '$lib/username'

  let {
    value = $bindable(''),
    isValid = $bindable<boolean | null>(null),
    currentUsername = '',
  }: {
    value: string
    isValid?: boolean | null
    currentUsername?: string
  } = $props()

  let checking = $state(false)
  let available = $state<boolean | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  // Формат + зарезервовані — за єдиним правилом із $lib/username.
  const check = $derived(validateUsername(value))
  const formatOk = $derived(check.ok)
  const reserved = $derived(!check.ok && check.reason === 'reserved')

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

<Field.Field>
  <Field.Label for="username">Username</Field.Label>
  <div class="relative">
    <span
      class="absolute left-3 top-1/2 -translate-y-1/2 text-sm select-none pointer-events-none"
      style="color: var(--muted-foreground)">@</span
    >
    <Input
      id="username"
      type="text"
      placeholder="oleksandr_master"
      bind:value
      maxlength={20}
      class={cn(
        'pl-7 pr-9',
        value && !formatOk && 'border-destructive',
        available === false && 'border-destructive',
        available === true && 'border-green-500',
      )}
      oninput={() => {
        value = value.toLowerCase().replace(/[^a-z0-9_]/g, '')
      }}
    />
    <span class="absolute right-3 top-1/2 -translate-y-1/2">
      {#if checking}
        <Spinner />
      {:else if available === true}
        <CheckIcon class="size-4" style="color: #10b981" />
      {:else if available === false}
        <XCircleIcon class="size-4" style="color: var(--destructive)" />
      {/if}
    </span>
  </div>
  {#if value && !formatOk}
    <Field.Description class="text-destructive">
      {reserved
        ? 'Цей username зарезервовано'
        : '3-20 символів, починається з літери (a-z, 0-9, _)'}
    </Field.Description>
  {:else if available === false}
    <Field.Description class="text-destructive">
      Цей username вже зайнято
    </Field.Description>
  {:else}
    <Field.Description>
      Посилання: zunor.org/@{value || 'username'}
    </Field.Description>
  {/if}
</Field.Field>
