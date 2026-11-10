<!--
  Список знайденого під шапкою чату, як у Telegram Web: хто, коли і
  шматок тексту з підсвіченим збігом. Клік — перейти до повідомлення.

  mousedown без фокуса: інакше поле пошуку втратило б фокус раніше за
  клік, шапка згорнула б список, і клік влучив би в порожнечу.
-->
<script lang="ts">
  import { formatChatTime } from './calendar-time'
  import { searchSnippet } from './search'
  import type { ChatMessage } from './types'

  interface Props {
    results: ChatMessage[]
    query: string
    /** Рядок під клавіатурою (↑/↓ у полі пошуку). */
    cursor: number
    currentUserId: string
    peerName: string
    onSelect: (id: string) => void
    onHover?: (index: number) => void
  }

  let {
    results,
    query,
    cursor,
    currentUserId,
    peerName,
    onSelect,
    onHover,
  }: Props = $props()

  let list = $state<HTMLElement | null>(null)

  // Стрілками можна піти за край видимого — тягнемо рядок у поле зору.
  $effect(() => {
    const row = list?.children[cursor] as HTMLElement | undefined
    row?.scrollIntoView({ block: 'nearest' })
  })

  /** 1, 2–4 (крім 11–14) — «повідомлення», решта — «повідомлень». */
  function countLabel(n: number): string {
    const tens = n % 100
    const ones = n % 10
    const few = ones >= 1 && ones <= 4 && !(tens >= 11 && tens <= 14)
    return `Знайдено ${n} ${few ? 'повідомлення' : 'повідомлень'}`
  }
</script>

{#if results.length === 0}
  <p class="px-5 py-4 text-center text-[14px] text-muted-foreground">
    Немає результатів за запитом «<span class="font-semibold text-foreground"
      >{query.trim()}</span
    >».
  </p>
{:else}
  <p class="px-5 pt-3 pb-1 text-[12px] font-medium text-muted-foreground">
    {countLabel(results.length)}
  </p>
  <ul
    bind:this={list}
    class="max-h-[min(55vh,26rem)] overflow-y-auto overscroll-contain px-2 pb-2"
  >
    {#each results as m, i (m.id)}
      {@const s = searchSnippet(m.text, query)}
      <li>
        <button
          type="button"
          onmousedown={(e) => e.preventDefault()}
          onclick={() => onSelect(m.id)}
          onmousemove={() => onHover?.(i)}
          class="flex w-full cursor-pointer flex-col gap-0.5 rounded-2xl px-3 py-2 text-left transition-colors {i ===
          cursor
            ? 'bg-muted'
            : ''}"
        >
          <span class="flex items-baseline gap-2">
            <span class="min-w-0 flex-1 truncate text-[14px] font-semibold">
              {m.senderId === currentUserId ? 'Ви' : peerName}
            </span>
            <span
              class="shrink-0 text-[12px] text-muted-foreground tabular-nums"
            >
              {formatChatTime(m.createdAt)}
            </span>
          </span>
          <span
            class="line-clamp-2 text-[13.5px] leading-snug text-muted-foreground"
            >{s.before}<mark
              class="rounded-sm bg-primary/15 px-0.5 font-medium text-primary"
              >{s.match}</mark
            >{s.after}</span
          >
        </button>
      </li>
    {/each}
  </ul>
{/if}
