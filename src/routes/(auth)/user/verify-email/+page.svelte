<script lang="ts">
  import OtpForm from '$lib/components/otp-form.svelte'
  import { ArrowLeft } from 'lucide-svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<svelte:head>
  <title>Підтвердження пошти — Zunor</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<!--
  Та сама розкладка, що на вході й реєстрації: одна колонка по центру,
  без картинки збоку.
-->
<div
  class="relative flex min-h-svh flex-col items-center justify-center px-5 py-16"
>
  <a
    href="/"
    class="absolute start-5 top-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:start-8 sm:top-8"
  >
    <ArrowLeft size={18} aria-hidden="true" />
    Головна
  </a>

  <div class="w-full max-w-[480px]">
    <OtpForm email={data.email} />
  </div>
</div>
