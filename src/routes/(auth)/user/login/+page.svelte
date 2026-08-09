<script lang="ts">
  import { ArrowLeft, Plus } from 'lucide-svelte'
  import LoginForm from '$lib/components/login-form.svelte'
</script>

<div class="grid min-h-svh lg:grid-cols-2">
  <div class="flex flex-col gap-4 p-6 md:p-10">
    <div class="flex gap-2 md:justify-start">
      <a
        href="/"
        class="flex items-center gap-2 font-medium hover:text-gray-400"
      >
        <ArrowLeft size={20} />
        Головна
      </a>
    </div>
    <div class="flex flex-1 items-center justify-center">
      <div class="w-full max-w-xs">
        <LoginForm />
      </div>
    </div>
  </div>
  <div class="relative hidden bg-muted lg:block">
    <img
      src="/login.png"
      alt="placeholder"
      class="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
    />
  </div>
</div>
