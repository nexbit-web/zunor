<script lang="ts">
  // Рендер тіла повідомлення Zunor з мікроформату:
  //   порожній рядок → межа абзацу; рядок «— …» → пункт списку.
  // Текст моделі — недовірений ввід: у DOM він потрапляє лише через
  // текстові вузли Svelte, {@html} немає — XSS неможливий за побудовою.
  // Рядок >>> сюди не доходить: його ріже visibleText/extractSuggestions.
  //
  // «— » у тексті — лише ПРОТОКОЛ. Візуальний маркер — крапка кольору
  // primary, малюється компонентом. У пунктах «Назва — опис» назва
  // виділяється напівжирним (клієнтський парсинг, моделі це не коштує).
  //
  // typing: курсор друку рендериться ВСЕРЕДИНІ останнього блока.

  interface ListLine {
    /** Термін до « — » (якщо пункт має форму «Назва — опис»), інакше null. */
    term: string | null
    body: string
  }
  interface Block {
    kind: 'paragraph' | 'list'
    lines: string[]
    items?: ListLine[]
  }

  let { text, typing = false }: { text: string; typing?: boolean } = $props()

  // «Генеральне — глибоке прибирання» → term «Генеральне», body «глибоке…».
  // Термін обмежуємо 4 словами: довший лівий бік — це вже речення з тире
  // посередині, його не жирнимо.
  function splitTerm(line: string): ListLine {
    const at = line.indexOf(' — ')
    if (at === -1) return { term: null, body: line }
    const term = line.slice(0, at).trim()
    if (!term || term.split(/\s+/).length > 4) return { term: null, body: line }
    return { term, body: line.slice(at + 3).trim() }
  }

  const blocks = $derived.by((): Block[] => {
    const out: Block[] = []
    for (const chunk of text.split(/\n{2,}/)) {
      const lines = chunk
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (!lines.length) continue

      let group: string[] = []
      let groupIsList: boolean | null = null
      const flush = () => {
        if (!group.length) return
        if (groupIsList) {
          const items = group.map((l) => splitTerm(l.slice(2).trim()))
          out.push({ kind: 'list', lines: [], items })
        } else {
          out.push({ kind: 'paragraph', lines: group })
        }
        group = []
      }
      for (const line of lines) {
        const isListLine = line.startsWith('— ')
        if (groupIsList !== null && isListLine !== groupIsList) flush()
        groupIsList = isListLine
        group.push(line)
      }
      flush()
    }
    return out
  })
</script>

{#snippet cursor()}
  <span
    class="ml-0.5 -mb-0.5 inline-block h-3.75 w-0.5 animate-pulse bg-foreground/50"
  ></span>
{/snippet}

<div
  class="space-y-2.5 text-[15.5px] leading-[1.7] wrap-break-word text-foreground"
>
  {#each blocks as block, i (i)}
    {@const isLast = i === blocks.length - 1}
    {#if block.kind === 'list' && block.items}
      <ul class="space-y-1.5">
        {#each block.items as item, j (j)}
          <li class="flex gap-2.5">
            <span
              class="mt-[0.72em] size-1.5 shrink-0 rounded-full bg-primary"
              aria-hidden="true"
            ></span>
            <span
              >{#if item.term}<span class="font-medium">{item.term}</span
                >&nbsp;—
              {/if}{item.body}{#if typing && isLast && j === block.items.length - 1}{@render cursor()}{/if}</span
            >
          </li>
        {/each}
      </ul>
    {:else}
      <p>
        {block.lines.join(' ')}{#if typing && isLast}{@render cursor()}{/if}
      </p>
    {/if}
  {/each}
  {#if typing && !blocks.length}
    {@render cursor()}
  {/if}
</div>
