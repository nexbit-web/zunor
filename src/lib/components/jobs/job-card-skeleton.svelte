<!--
  Заглушки карток на час догрузки.

  Прийшли на зміну спінеру: спінер нічого не каже про те, що зараз
  приїде, і список стрибає на його висоту, коли картки нарешті стають на
  місце. Заглушка повторює картку заявки (job-card): назва, рядки
  фактів з іконками, опис на два рядки й час унизу.
-->
<script lang="ts">
  import { Skeleton } from '$lib/components/ui/skeleton'

  let { count = 2 }: { count?: number } = $props()

  // Ширини рядків фактів — різні, як у справжніх картках.
  const ROWS = ['w-36', 'w-44', 'w-28', 'w-32', 'w-64']
</script>

<ul aria-hidden="true" class="mt-3 flex flex-col gap-3">
  {#each Array.from({ length: count }), i (i)}
    <li class="rounded-2xl border border-border bg-card px-5 py-5 sm:px-6">
      <Skeleton class="h-5 w-3/5" />
      <div class="mt-3.5 flex flex-col gap-2.5">
        {#each ROWS as w (w)}
          <div class="flex items-center gap-2.5">
            <Skeleton class="size-[18px] rounded-md" />
            <Skeleton class="h-3.5 {w}" />
          </div>
        {/each}
      </div>
      <Skeleton class="mt-4 h-3.5 w-full" />
      <Skeleton class="mt-2 h-3.5 w-10/12" />
      <Skeleton class="mt-4 h-3 w-20" />
    </li>
  {/each}
</ul>
