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

<div class="grid min-h-svh lg:grid-cols-2">
  <div class="flex flex-col gap-4 p-6 md:p-10">
    <div class="flex gap-2 md:justify-start">
      <a
        href="/user/login"
        class="flex items-center gap-2 font-medium hover:text-muted-foreground"
      >
        <ArrowLeft size={20} aria-hidden="true" />
        Назад
      </a>
    </div>
    <div class="flex flex-1 items-center justify-center">
      <div class="w-full max-w-xs">
        <OtpForm email={data.email} />
      </div>
    </div>
  </div>
  <div class="relative hidden bg-muted lg:block">
    <img
      src="/otp.png"
      alt=""
      class="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
    />
  </div>
</div>
