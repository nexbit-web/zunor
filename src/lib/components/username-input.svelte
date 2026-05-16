<!-- src/lib/components/username-input.svelte -->
<script lang="ts">
  import { Input } from '$lib/components/ui/input'
  import { Check, X, Loader2, AtSign } from 'lucide-svelte'

  interface Props {
    value?: string
    /** Повертає true коли username валідний і доступний */
    onvalidchange?: (username: string | null) => void
  }

  let { value = $bindable(''), onvalidchange }: Props = $props()

  let status = $state<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>(
    'idle',
  )
  let hint = $state('')
  let suggestions = $state<string[]>([])
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function handleInput(e: Event) {
    const raw = (e.target as HTMLInputElement).value
    // нормалізація: тільки латиниця/цифри/_
    const cleaned = raw
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 20)
    value = cleaned
    check()
  }

  function check() {
    if (debounceTimer) clearTimeout(debounceTimer)
    status = 'idle'
    hint = ''
    suggestions = []
    onvalidchange?.(null)

    if (!value) return

    if (value.length < 3) {
      status = 'invalid'
      hint = 'Мінімум 3 символи'
      return
    }

    status = 'checking'
    debounceTimer = setTimeout(runCheck, 400)
  }

  async function runCheck() {
    try {
      const res = await fetch(
        `/api/user/username/check?u=${encodeURIComponent(value)}`,
      )
      if (!res.ok) throw new Error('fail')
      const data = await res.json()

      if (!data.valid) {
        status = 'invalid'
        hint = data.hint ?? 'Невірний формат'
        return
      }

      if (data.available) {
        status = 'available'
        hint = 'Доступний'
        onvalidchange?.(value)
      } else {
        status = 'taken'
        hint =
          data.reason === 'reserved'
            ? 'Це імʼя зарезервовано'
            : 'Цей нікнейм уже зайнято'
        suggestions = data.suggestions ?? []
      }
    } catch {
      status = 'invalid'
      hint = 'Не вдалось перевірити'
    }
  }

  function pickSuggestion(s: string) {
    value = s
    check()
  }

  const borderColor = $derived(
    status === 'available'
      ? '#10b981'
      : status === 'taken' || status === 'invalid'
        ? 'var(--destructive)'
        : 'color-mix(in oklch, var(--foreground) 10%, transparent)',
  )
</script>

<div>
  <div class="relative">
    <span
      class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
      style="color: var(--muted-foreground)"
    >
      <AtSign class="size-4" />
    </span>
    <Input
      type="text"
      placeholder="nickname"
      {value}
      oninput={handleInput}
      autocomplete="off"
      spellcheck="false"
      maxlength={20}
      class="h-11 pl-9 pr-10 lowercase"
      style="border-color: {borderColor}"
    />
    <span class="absolute right-3 top-1/2 -translate-y-1/2">
      {#if status === 'checking'}
        <Loader2
          class="size-4 animate-spin"
          style="color: var(--muted-foreground)"
        />
      {:else if status === 'available'}
        <Check class="size-4" style="color: #10b981" />
      {:else if status === 'taken' || status === 'invalid'}
        <X class="size-4" style="color: var(--destructive)" />
      {/if}
    </span>
  </div>

  {#if hint}
    <p
      class="text-xs mt-1.5"
      style="color: {status === 'available'
        ? '#10b981'
        : status === 'taken' || status === 'invalid'
          ? 'var(--destructive)'
          : 'var(--muted-foreground)'}"
    >
      {hint}
    </p>
  {/if}

  {#if suggestions.length > 0}
    <div class="mt-2 flex flex-wrap gap-1.5 items-center">
      <span class="text-xs" style="color: var(--muted-foreground)">
        Доступні:
      </span>
      {#each suggestions as s}
        <button
          type="button"
          onclick={() => pickSuggestion(s)}
          class="text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors hover:opacity-70"
          style="border-color: color-mix(in oklch, var(--primary) 25%, transparent);
                 color: var(--primary);
                 background-color: color-mix(in oklch, var(--primary) 8%, transparent)"
        >
          @{s}
        </button>
      {/each}
    </div>
  {/if}
</div>
