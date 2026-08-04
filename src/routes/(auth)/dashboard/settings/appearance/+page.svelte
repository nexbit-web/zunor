<script lang="ts">
  import ThemePicker from '$lib/components/settings/theme-picker.svelte'
</script>

<div>
  <h2 class="mb-2 px-1 text-sm font-semibold">Вигляд</h2>

  <div class="rounded-xl bg-muted/40 py-1">
    <div class="mx-4 py-4">
      <ThemePicker />
    </div>
  </div>

  <p class="mt-3 px-1 text-[12px] leading-relaxed text-muted-foreground">
    «Системна» підлаштовується під налаштування вашого пристрою.
  </p>
</div>