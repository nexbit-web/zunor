<script lang="ts">
  import { formatFull } from '$lib/utils/time'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  // Людські назви дій. Невідомий ключ показуємо як є — краще сирий ключ,
  // ніж прихована дія.
  const ACTION: Record<string, string> = {
    'auth.2fa': 'Вхід в адмінку',
    'auth.2fa_setup': 'Налаштував другий фактор',
    'verify.approve': 'Підтвердив анкету',
    'verify.reject': 'Відхилив анкету',
    'report.resolve': 'Розглянув скаргу',
    'report.dismiss': 'Відхилив скаргу',
    'report.view_chat': 'Переглянув чат зі скарги',
    'user.ban': 'Заблокував',
    'user.unban': 'Розблокував',
    'staff.role': 'Змінив роль',
    'staff.reset_2fa': 'Скинув другий фактор',
  }

  const targetHref = (type: string | null, id: string | null) =>
    !type || !id ? null : type === 'user' ? `/admin/users/${id}` : type === 'report' ? `/admin/reports/${id}` : null
</script>

<svelte:head><title>Журнал · Адмінка Zunor</title></svelte:head>

<h1 class="text-2xl font-semibold tracking-tight">Журнал дій</h1>
<p class="mt-1 text-[13.5px] text-muted-foreground">
  Кожна дія в адмінці. Записи лише додаються — змінити чи стерти їх звідси не можна.
</p>

{#if data.items.length === 0}
  <p class="mt-16 text-center text-[15px] text-muted-foreground">Записів поки немає.</p>
{:else}
  <ul class="mt-5 flex flex-col overflow-hidden rounded-xl border border-border bg-card">
    {#each data.items as a (a.id)}
      {@const href = targetHref(a.targetType, a.targetId)}
      <li class="border-t border-border/60 px-4 py-2.5 text-[14px] first:border-t-0">
        <div class="flex flex-wrap items-baseline justify-between gap-x-3">
          <span>
            <span class="font-medium">{a.actor.name ?? a.actor.email}</span>
            — {ACTION[a.action] ?? a.action}
            {#if href}<a {href} class="text-primary hover:underline">→ відкрити</a>{/if}
          </span>
          <span class="text-[12.5px] text-muted-foreground">
            {formatFull(a.createdAt)}{a.ip ? ` · ${a.ip}` : ''}
          </span>
        </div>
        {#if a.details}
          <p class="mt-0.5 font-mono text-[12px] break-all text-muted-foreground">{a.details}</p>
        {/if}
      </li>
    {/each}
  </ul>
  {#if data.next}
    <a href="?before={encodeURIComponent(data.next)}" class="mt-4 inline-block text-[14px] text-primary hover:underline">
      Старіші записи →
    </a>
  {/if}
{/if}
