<script lang="ts">
  import { Input } from '$lib/components/ui/input'
  import Search from '$lib/components/icons/set/search.svelte'
  import ChevronRight from '$lib/components/icons/set/chevron-right.svelte'
  import { ROLE_LABEL, isStaff } from '$lib/admin/roles'
  import { formatFull } from '$lib/utils/time'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  const roleLabel = (role: string) =>
    isStaff(role) ? ROLE_LABEL[role] : role === 'MASTER' ? 'Майстер' : 'Клієнт'
</script>

<svelte:head><title>Користувачі · Адмінка Zunor</title></svelte:head>

<h1 class="text-2xl font-semibold tracking-tight">Користувачі</h1>

<form method="GET" class="mt-5 flex flex-wrap items-center gap-3">
  <div class="min-w-0 flex-1 basis-64">
    <Input
      name="q"
      value={data.q}
      icon={Search}
      placeholder="Пошта, імʼя чи @handle"
      aria-label="Пошук"
    />
  </div>
  <label class="flex items-center gap-2 text-[14px] text-muted-foreground">
    <input type="checkbox" name="banned" value="1" checked={data.bannedOnly} class="size-4" />
    Лише заблоковані
  </label>
  <button
    type="submit"
    class="h-9 cursor-pointer rounded-lg bg-secondary px-4 text-[14px] font-medium transition-colors hover:bg-muted"
  >
    Шукати
  </button>
</form>

{#if data.users.length === 0}
  <p class="mt-16 text-center text-[15px] text-muted-foreground">Нікого не знайдено.</p>
{:else}
  <ul class="mt-5 flex flex-col overflow-hidden rounded-xl border border-border bg-card">
    {#each data.users as u (u.id)}
      <li class="border-t border-border/60 first:border-t-0">
        <a
          href="/admin/users/{u.id}"
          class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[15px] font-medium">
              {u.name ?? 'Без імені'}
              {#if u.deleted}
                <span class="text-[12.5px] font-normal text-muted-foreground"> · видалено</span>
              {:else if u.banned}
                <span class="text-[12.5px] font-normal text-destructive"> · заблоковано</span>
              {/if}
            </span>
            <span class="block truncate text-[13px] text-muted-foreground">
              {u.email} · {roleLabel(u.role)} · з {formatFull(u.createdAt)}
            </span>
          </span>
          <ChevronRight size={18} class="shrink-0 text-muted-foreground" />
        </a>
      </li>
    {/each}
  </ul>
{/if}
