<script lang="ts">
  // Рядок помилки під полем: іконка плюс текст звичайною вагою. Той
  // самий вигляд, що в SettingsField і FloatingInput, — червоний колір
  // сам по собі не повідомлення для того, хто його не розрізняє.
  // id — щоб поле посилалось на помилку через aria-describedby.
  import { CircleAlert } from 'lucide-svelte'

  let { id, text }: { id?: string; text: string } = $props()
</script>

{#if text}
  <p
    {id}
    class="mt-1.5 flex items-center gap-1.5 text-[13px] font-normal text-destructive"
    role="alert"
  >
    <CircleAlert class="size-3.5 shrink-0" aria-hidden="true" />
    {text}
  </p>
{/if}
