<!--
  Заглушки рядків на час догрузки.

  Прийшли на зміну спінеру: спінер нічого не каже про те, що зараз
  приїде, і список стрибає на його висоту, коли рядки нарешті стають на
  місце. Заглушка повторює рядок заявки (job-row): іконка, назва, нижній
  рядок і стан праворуч.
-->
<script lang="ts">
  import { Skeleton } from '$lib/components/ui/skeleton'

  let { count = 2 }: { count?: number } = $props()
</script>

<ul aria-hidden="true">
  {#each Array.from({ length: count }), i (i)}
    <li
      class="flex items-start gap-3.5 border-b border-border/60 py-3.5 sm:gap-4 sm:py-4"
    >
      <Skeleton class="size-10 shrink-0 rounded-xl" />
      <div class="min-w-0 flex-1">
        <Skeleton class="h-4 w-3/5" />
        <Skeleton class="mt-2.5 h-3.5 w-40" />
      </div>
      <Skeleton class="hidden h-6 w-28 rounded-full sm:block" />
    </li>
  {/each}
</ul>
