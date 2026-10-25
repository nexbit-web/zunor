<script lang="ts">
  // Поле пароля з перемикачем «показати» — спільне для входу й реєстрації.
  // Значення й видимість віддає стану рамки (password-field.svelte.ts): з
  // нього знак над формою знає, коли закрити очі руками, а коли підглянути.
  import { Eye, EyeOff } from 'lucide-svelte'
  import { Input } from '$lib/components/ui/input'
  import { usePasswordField } from './password-field.svelte'

  interface Props {
    id: string
    value: string
    autocomplete: 'current-password' | 'new-password'
    maxlength?: number
    /** id підпису з помилкою; є — поле підсвічене як невірне. */
    errorId?: string
  }

  let {
    id,
    value = $bindable(),
    autocomplete,
    maxlength,
    errorId,
  }: Props = $props()

  const field = usePasswordField()
  field.connect(() => value)
</script>

<div class="relative">
  <Input
    {id}
    type={field.visible ? 'text' : 'password'}
    placeholder="Пароль"
    aria-label="Пароль"
    bind:value
    {autocomplete}
    {maxlength}
    aria-invalid={!!errorId}
    aria-describedby={errorId}
    class="h-9 rounded-[8px] pr-9"
    required
  />
  <!-- mousedown не забирає фокус із поля: курсор лишається там, де
       друкували. -->
  <button
    type="button"
    onmousedown={(e) => e.preventDefault()}
    onclick={() => (field.visible = !field.visible)}
    class="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    aria-label={field.visible ? 'Сховати пароль' : 'Показати пароль'}
    aria-pressed={field.visible}
    tabindex={-1}
  >
    {#if field.visible}
      <EyeOff class="size-4" aria-hidden="true" />
    {:else}
      <Eye class="size-4" aria-hidden="true" />
    {/if}
  </button>
</div>
