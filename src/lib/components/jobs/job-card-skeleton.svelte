<!--
  Заглушки карток на час догрузки.

  Прийшли на зміну спінеру: спінер нічого не каже про те, що зараз
  приїде, і список стрибає на його висоту, коли картки нарешті стають
  на місце. Заглушка займає приблизно те саме місце, що й картка.
-->
<script lang="ts">
  import { Skeleton } from '$lib/components/ui/skeleton'

  let {
    count = 3,
    rounded = 'rounded-3xl',
  }: { count?: number; rounded?: string } = $props()
</script>

{#each Array.from({ length: count }), i (i)}
  <div class="border border-border bg-card p-5 {rounded}" aria-hidden="true">
    <div class="mb-3 flex items-center gap-2">
      <Skeleton class="h-5 w-20 rounded-full" />
      <Skeleton class="h-3.5 w-16" />
    </div>
    <Skeleton class="mb-2 h-5 w-3/4" />
    <Skeleton class="mb-4 h-4 w-1/2" />
    <div class="mb-4 flex gap-2">
      <Skeleton class="h-7 w-24 rounded-full" />
      <Skeleton class="h-7 w-20 rounded-full" />
    </div>
    <div class="flex items-center gap-3 border-t border-border/60 pt-3">
      <Skeleton class="size-8 rounded-full" />
      <Skeleton class="h-3.5 w-28" />
    </div>
  </div>
{/each}
