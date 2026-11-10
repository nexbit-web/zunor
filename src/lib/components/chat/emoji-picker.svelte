<!--
  Кнопка-смайлик у полі вводу й панель емодзі над нею, як у Telegram.

  Панель не закривається після вибору — кілька емодзі поспіль ставлять
  частіше, ніж одне. «Нещодавні» перечитуються лише при відкритті: якби
  ряд перебудовувався на кожен дотик, емодзі тікали б з-під пальця.
-->
<script lang="ts">
  import { mergeProps } from 'bits-ui'
  import Smile from '$lib/components/icons/set/smile.svelte'
  import * as Popover from '$lib/components/ui/popover'
  import {
    EMOJI_GROUPS,
    recentEmoji,
    rememberEmoji,
    type EmojiGroup,
  } from './emoji'

  interface Props {
    onPick: (emoji: string) => void
  }

  let { onPick }: Props = $props()

  let open = $state(false)
  let recent = $state<string[]>([])

  const sections = $derived<EmojiGroup[]>(
    recent.length
      ? [{ title: 'Нещодавні', emoji: recent }, ...EMOJI_GROUPS]
      : EMOJI_GROUPS,
  )

  function onOpenChange(next: boolean) {
    if (next) recent = recentEmoji()
  }

  function pick(emoji: string) {
    rememberEmoji(emoji)
    onPick(emoji)
  }
</script>

<Popover.Root bind:open {onOpenChange}>
  <Popover.Trigger>
    {#snippet child({ props })}
      <!-- mousedown без фокуса: курсор лишається в полі, на телефоні не
           ховається клавіатура. -->
      <button
        {...mergeProps(props, {
          onmousedown: (e: MouseEvent) => e.preventDefault(),
        })}
        type="button"
        aria-label="Емодзі"
        class="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors {open
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground'}"
      >
        <Smile class="size-5.5" />
      </button>
    {/snippet}
  </Popover.Trigger>

  <Popover.Content
    side="top"
    align="end"
    sideOffset={12}
    alignOffset={-6}
    onOpenAutoFocus={(e) => e.preventDefault()}
    onCloseAutoFocus={(e) => e.preventDefault()}
    class="w-[min(20rem,calc(100vw-1.5rem))] gap-0 overflow-hidden rounded-3xl border border-border bg-card p-0 shadow-lg ring-0"
  >
    <div
      class="max-h-72 overflow-y-auto overscroll-contain px-2 pb-2"
      role="group"
      aria-label="Емодзі"
    >
      {#each sections as section (section.title)}
        <p
          class="sticky top-0 z-10 bg-card/95 px-1.5 pt-2.5 pb-1 text-[11px] font-semibold text-muted-foreground backdrop-blur"
        >
          {section.title}
        </p>
        <div class="grid grid-cols-8">
          {#each section.emoji as emoji (emoji)}
            <button
              type="button"
              class="emoji"
              onmousedown={(e) => e.preventDefault()}
              onclick={() => pick(emoji)}
              aria-label={emoji}
            >
              {emoji}
            </button>
          {/each}
        </div>
      {/each}
    </div>
  </Popover.Content>
</Popover.Root>

<style>
  .emoji {
    display: flex;
    aspect-ratio: 1;
    align-items: center;
    justify-content: center;
    border-radius: 0.75rem;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .emoji:hover {
    background-color: var(--muted);
    transform: scale(1.12);
  }

  .emoji:active {
    transform: scale(0.92);
  }

  @media (prefers-reduced-motion: reduce) {
    .emoji {
      transition: none;
    }
  }
</style>
