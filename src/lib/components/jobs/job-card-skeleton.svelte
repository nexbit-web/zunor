<!--
  Заглушки карток на час догрузки.

  Прийшли на зміну спінеру: спінер нічого не каже про те, що зараз
  приїде, і список стрибає на його висоту, коли картки нарешті стають на
  місце. Заглушка повторює сітку картки — та сама рамка, те саме
  заокруглення, ті самі чотири рядки.
-->
<script lang="ts">
  import { Skeleton } from '$lib/components/ui/skeleton'

  let { count = 2 }: { count?: number } = $props()
</script>

<div class="mt-3 space-y-3" aria-hidden="true">
  {#each Array.from({ length: count }), i (i)}
    <div class="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
      <Skeleton class="h-5 w-28 rounded-full" />
      <Skeleton class="mt-3 h-5 w-3/5" />
      <Skeleton class="mt-2 h-4 w-4/5" />
      <Skeleton class="mt-4 h-3.5 w-44" />
    </div>
  {/each}
</div>
