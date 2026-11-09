<!--
  «Схожа заявка вже шукає майстра» — над кнопкою створення, у формі без
  чату й на картці драфту в чаті. Дані — з 409 від POST /api/jobs
  ($lib/server/job-duplicates). Друга заявка створюється лише кнопкою
  «Все одно створити» поруч; картка веде до тієї, що вже є: там видно
  пропозиції, і там її можна змінити.
-->
<script lang="ts">
  import ServiceIcon from '$lib/categories/cleaning/service-icon.svelte'
  import ChevronRight from '$lib/components/icons/set/chevron-right.svelte'
  import { formatDay } from '$lib/utils/time'
  import type { DuplicateJob } from '$lib/types/jobs'

  let {
    duplicate,
    service,
    class: className = '',
  }: {
    duplicate: DuplicateJob
    /** Послуга для іконки — та сама, що в новій заявці. */
    service: unknown
    class?: string
  } = $props()
</script>

<div role="alert" class={['rounded-[16px] bg-muted p-1.5', className]}>
  <p class="px-2.5 pt-2 pb-2.5 text-[13.5px] leading-relaxed">
    <span class="font-semibold text-foreground"
      >Схожа заявка вже шукає майстра.</span
    >
    <span class="text-muted-foreground">
      Якщо це та сама — краще змінити її: майстри з пропозиціями отримають
      оновлення.
    </span>
  </p>
  <a
    href="/dashboard/jobs/{duplicate.id}"
    class="flex items-center gap-3 rounded-[12px] bg-card px-3 py-2.5 transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
  >
    <span
      class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted"
    >
      <ServiceIcon {service} class="size-[18px] text-muted-foreground" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-[14px] font-medium text-foreground">
        {duplicate.title}
      </span>
      <span class="block text-[12.5px] text-muted-foreground">
        {duplicate.day ? formatDay(duplicate.day) : 'Відкрита заявка'}
      </span>
    </span>
    <span class="sr-only">Відкрити заявку</span>
    <ChevronRight
      class="size-4 shrink-0 text-muted-foreground"
      aria-hidden="true"
    />
  </a>
</div>
