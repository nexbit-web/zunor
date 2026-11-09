<script lang="ts">
  import { enhance } from '$app/forms'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { ROLE_LABEL, STAFF_ROLES } from '$lib/admin/roles'
  import CircleAlert from '$lib/components/icons/set/circle-alert.svelte'
  import Check from '$lib/components/icons/set/check.svelte'
  import type { ActionData, PageData } from './$types'

  let { data, form }: { data: PageData; form: ActionData } = $props()

  let busy = $state(false)
  const submit = () => {
    busy = true
    return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false })
      busy = false
    }
  }

  const SELECT =
    'h-9 rounded-lg border border-input bg-(--field) px-2.5 text-[14px] outline-none focus-visible:border-ring'
</script>

<svelte:head><title>Співробітники · Адмінка Zunor</title></svelte:head>

<h1 class="text-2xl font-semibold tracking-tight">Співробітники</h1>

{#if form && 'error' in form && form.error}
  <p class="mt-4 flex items-center gap-1.5 text-[13px] text-destructive" role="alert">
    <CircleAlert class="size-4 shrink-0" />{form.error}
  </p>
{:else if form && 'ok' in form && form.ok}
  <p class="mt-4 flex items-center gap-1.5 text-[13px] text-emerald-700 dark:text-emerald-400" role="status">
    <Check class="size-4 shrink-0" />{form.ok}
  </p>
{/if}

<section class="mt-5 rounded-xl border border-border bg-card p-4">
  <h2 class="text-[15px] font-medium">Додати співробітника</h2>
  <p class="mt-1 text-[13px] leading-relaxed text-muted-foreground">
    Людина спершу реєструється в Zunor звичайним шляхом, потім ви видаєте
    роль за її поштою. При першому вході в адмінку вона налаштує другий
    фактор. Майстер співробітником бути не може — потрібен окремий акаунт.
  </p>
  <form method="POST" action="?/setRole" use:enhance={submit} class="mt-3 flex flex-wrap gap-2">
    <div class="min-w-0 flex-1 basis-60">
      <Input name="email" type="email" placeholder="Пошта" required />
    </div>
    <select name="role" class={SELECT} aria-label="Роль">
      {#each STAFF_ROLES as r (r)}
        <option value={r} selected={r === 'MODERATOR'}>{ROLE_LABEL[r]}</option>
      {/each}
    </select>
    <Button type="submit" class="h-9" disabled={busy}>Видати роль</Button>
  </form>
</section>

<ul class="mt-5 flex flex-col overflow-hidden rounded-xl border border-border bg-card">
  {#each data.staff as s (s.id)}
    <li class="flex flex-wrap items-center gap-3 border-t border-border/60 px-4 py-3 first:border-t-0">
      <span class="min-w-0 flex-1 basis-56">
        <span class="block truncate text-[15px] font-medium">
          {s.name ?? 'Без імені'}
          {#if s.id === data.meId}<span class="text-[12.5px] font-normal text-muted-foreground"> · ви</span>{/if}
        </span>
        <span class="block truncate text-[13px] text-muted-foreground">
          {s.email} ·
          {#if s.twoFactor}другий фактор налаштовано{:else}<span class="text-amber-700 dark:text-amber-400">другий фактор ще не налаштовано</span>{/if}
          {#if s.banned}<span class="text-destructive"> · заблоковано</span>{/if}
        </span>
      </span>

      {#if s.id !== data.meId}
        <form method="POST" action="?/setRole" use:enhance={submit} class="flex items-center gap-2">
          <input type="hidden" name="email" value={s.email} />
          <select name="role" class={SELECT} aria-label="Роль {s.email}">
            {#each STAFF_ROLES as r (r)}
              <option value={r} selected={r === s.role}>{ROLE_LABEL[r]}</option>
            {/each}
            <option value="NONE">Зняти роль</option>
          </select>
          <Button type="submit" variant="secondary" size="sm" class="h-9" disabled={busy}>
            Зберегти
          </Button>
        </form>
        {#if s.twoFactor}
          <form method="POST" action="?/resetTwoFactor" use:enhance={submit}>
            <input type="hidden" name="userId" value={s.id} />
            <Button type="submit" variant="ghost" size="sm" class="h-9 text-muted-foreground" disabled={busy}>
              Скинути 2FA
            </Button>
          </form>
        {/if}
      {:else}
        <span class="text-[13.5px] text-muted-foreground">{ROLE_LABEL[s.role]}</span>
      {/if}
    </li>
  {/each}
</ul>
