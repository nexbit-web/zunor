<!-- src/lib/components/header/search-bar.svelte -->
<script lang="ts" module>
  interface SearchResult {
    type: 'category' | 'subcategory'
    slug: string
    name: string
    parentSlug?: string
    parentName?: string
    icon?: string | null
  }

  const cache = new Map<string, SearchResult[]>()
  const CACHE_MAX_SIZE = 100

  function cacheGet(key: string): SearchResult[] | undefined {
    return cache.get(key)
  }

  function cacheSet(key: string, value: SearchResult[]) {
    if (cache.size >= CACHE_MAX_SIZE) {
      const firstKey = cache.keys().next().value
      if (firstKey) cache.delete(firstKey)
    }
    cache.set(key, value)
  }
</script>

<script lang="ts">
  import { Search, X, LoaderCircle, Layers, Folder } from 'lucide-svelte'
  import { fly } from 'svelte/transition'
  import { onMount, onDestroy } from 'svelte'

  let {
    onnavigate,
    isOpen = $bindable(false),
  }: {
    onnavigate: (url: string) => void
    isOpen: boolean
  } = $props()

  // ─── State ───
  let searchValue = $state('')
  let searchRef = $state<HTMLInputElement | undefined>(undefined)
  let containerEl = $state<HTMLDivElement | undefined>(undefined)

  let results = $state<SearchResult[]>([])
  let loading = $state(false)
  let highlightedIndex = $state(-1)

  let menuOpen = $state(false)
  let focused = $state(false)

  // ─── Debounce + Abort + Race protection ───
  let searchTimer: ReturnType<typeof setTimeout> | null = null
  let abortController: AbortController | null = null
  let activeRequestId = 0

  const DEBOUNCE_MS = 400
  const QUERY_MIN = 2
  const QUERY_MAX = 50

  async function performSearch(query: string) {
    const q = query.trim()

    if (q.length < QUERY_MIN) {
      results = []
      loading = false
      menuOpen = false
      highlightedIndex = -1
      return
    }

    const cached = cacheGet(q.toLowerCase())
    if (cached) {
      results = cached
      loading = false
      menuOpen = true
      highlightedIndex = -1
      return
    }

    const requestId = ++activeRequestId

    if (abortController) abortController.abort()
    abortController = new AbortController()

    loading = true
    menuOpen = true

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: abortController.signal,
      })

      if (requestId !== activeRequestId) return

      if (!res.ok) {
        console.error('[search-bar] HTTP error:', res.status)
        results = []
        return
      }

      const data: { results: SearchResult[] } = await res.json()

      if (requestId !== activeRequestId) return

      results = data.results ?? []
      cacheSet(q.toLowerCase(), results)
      highlightedIndex = -1
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      console.error('[search-bar] failed:', err)
      if (requestId === activeRequestId) {
        results = []
      }
    } finally {
      if (requestId === activeRequestId) {
        loading = false
      }
    }
  }

  function handleInput() {
    if (searchTimer) clearTimeout(searchTimer)

    const q = searchValue.trim()
    if (q.length < QUERY_MIN) {
      results = []
      loading = false
      menuOpen = false
      highlightedIndex = -1
      if (abortController) abortController.abort()
      activeRequestId++
      return
    }

    menuOpen = true

    searchTimer = setTimeout(() => {
      performSearch(searchValue)
    }, DEBOUNCE_MS)
  }

  function clear() {
    searchValue = ''
    results = []
    highlightedIndex = -1
    menuOpen = false
    if (searchTimer) clearTimeout(searchTimer)
    if (abortController) abortController.abort()
    activeRequestId++
    searchRef?.focus()
  }

  function closeMenu() {
    menuOpen = false
    highlightedIndex = -1
  }

  /** Повне очищення стану — викликається після переходу */
  function resetAfterNavigate() {
    searchValue = ''
    results = []
    highlightedIndex = -1
    menuOpen = false
    focused = false
    if (searchTimer) clearTimeout(searchTimer)
    if (abortController) abortController.abort()
    activeRequestId++
    searchRef?.blur()
  }

  function reopenMenuIfNeeded() {
    if (searchValue.trim().length >= QUERY_MIN && results.length > 0) {
      menuOpen = true
    } else if (searchValue.trim().length >= QUERY_MIN) {
      performSearch(searchValue)
    }
  }

  function handleClickOutside(e: MouseEvent) {
    if (!containerEl) return
    const target = e.target as Node
    if (!containerEl.contains(target)) {
      closeMenu()
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (document.activeElement !== searchRef) return

    if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault()
      if (!menuOpen) {
        menuOpen = true
        return
      }
      highlightedIndex = (highlightedIndex + 1) % results.length
    } else if (e.key === 'ArrowUp' && results.length > 0 && menuOpen) {
      e.preventDefault()
      highlightedIndex =
        highlightedIndex <= 0 ? results.length - 1 : highlightedIndex - 1
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightedIndex >= 0 && results[highlightedIndex]) {
        navigateToResult(results[highlightedIndex])
      } else if (searchValue.trim()) {
        navigateToFallback(searchValue.trim())
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu()
      searchRef?.blur()
    }
  }

  function navigateToResult(r: SearchResult) {
    const url =
      r.type === 'category'
        ? `/services/${r.slug}`
        : `/services/${r.parentSlug}?sub=${r.slug}`

    resetAfterNavigate() // ← чистимо стан ДО переходу
    onnavigate(url)
  }

  function navigateToFallback(query: string) {
    const url = `/services?q=${encodeURIComponent(query)}`
    resetAfterNavigate()
    onnavigate(url)
  }

  // ─── Computed ───
  const showLoading = $derived(menuOpen && loading && results.length === 0)
  const showResultsList = $derived(menuOpen && !loading && results.length > 0)
  const showEmpty = $derived(
    menuOpen &&
      !loading &&
      results.length === 0 &&
      searchValue.trim().length >= QUERY_MIN,
  )

  $effect(() => {
    isOpen = menuOpen
  })

  onMount(() => {
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  })

  onDestroy(() => {
    if (searchTimer) clearTimeout(searchTimer)
    if (abortController) abortController.abort()
  })
</script>

<svelte:window onkeydown={onKeydown} />

<div data-search class="flex justify-center w-full">
  <div bind:this={containerEl} class="relative w-full max-w-xl">
    <!-- Інпут -->
    <div
      class="flex items-center h-11 rounded-xl overflow-hidden transition-all"
      class:rounded-b-none={menuOpen}
      class:border-b-transparent={menuOpen}
      style="background-color: rgba(255,255,255,0.06);
             border: 1px solid {focused
        ? 'rgba(255,255,255,0.22)'
        : 'rgba(255,255,255,0.14)'};"
    >
      <div class="flex items-center justify-center pl-4 pr-2.5 shrink-0">
        {#if loading}
          <LoaderCircle
            class="size-4 animate-spin"
            strokeWidth={2}
            style="color: rgba(255,255,255,0.7)"
          />
        {:else}
          <Search
            class="size-4"
            strokeWidth={2}
            style="color: rgba(255,255,255,0.7)"
          />
        {/if}
      </div>

      <input
        bind:this={searchRef}
        type="text"
        placeholder="Що потрібно зробити?"
        bind:value={searchValue}
        autocomplete="off"
        spellcheck="false"
        maxlength={QUERY_MAX}
        role="combobox"
        aria-expanded={menuOpen}
        aria-autocomplete="list"
        aria-controls="header-search-results"
        aria-activedescendant={highlightedIndex >= 0
          ? `header-result-${highlightedIndex}`
          : undefined}
        onfocus={() => {
          focused = true
          reopenMenuIfNeeded()
        }}
        onblur={() => (focused = false)}
        oninput={handleInput}
        class="flex-1 h-11 pr-3 text-sm bg-transparent border-none outline-none"
        style="color: white;"
      />

      {#if searchValue}
        <button
          type="button"
          onclick={clear}
          class="size-8 mr-1.5 flex items-center justify-center rounded-full transition-colors cursor-pointer shrink-0 hover-clear"
          style="color: rgba(255,255,255,0.55)"
          aria-label="Очистити"
        >
          <X class="size-3.5" strokeWidth={2} />
        </button>
      {/if}
    </div>

    <!-- ═══════ Меню результатів ═══════ -->
    {#if showLoading || showResultsList || showEmpty}
      <div
        tabindex="-1"
        id="header-search-results"
        role="listbox"
        transition:fly={{ y: -4, duration: 150 }}
        onmouseleave={() => (highlightedIndex = -1)}
        class="absolute top-full left-0 right-0 z-50 overflow-y-auto overflow-x-hidden header-search-scroll"
        style="background-color: #0a0a0a;
               border: 1px solid rgba(255,255,255,0.14);
               border-top: none;
               border-radius: 0 0 1.5rem 1.5rem;
               box-shadow: 0 24px 48px rgba(0,0,0,0.5);
               max-height: min(420px, 70vh);"
      >
        {#if showLoading}
          <div class="flex items-center justify-center py-10">
            <LoaderCircle
              class="size-5 animate-spin"
              style="color: rgba(255,255,255,0.4)"
            />
          </div>
        {:else if showResultsList}
          {#each results as r, i (r.type + ':' + r.slug + ':' + (r.parentSlug ?? ''))}
            <button
              id="header-result-{i}"
              type="button"
              role="option"
              aria-selected={i === highlightedIndex}
              onmouseenter={() => (highlightedIndex = i)}
              onmousedown={(e) => {
                e.preventDefault()
                navigateToResult(r)
              }}
              class="result-item w-full flex items-center gap-3 px-5 py-3 transition-colors cursor-pointer text-left"
              class:active={i === highlightedIndex}
            >
              <div
                class="size-7 rounded-md flex items-center justify-center shrink-0"
                style="background-color: rgba(255,255,255,0.05)"
              >
                {#if r.type === 'category'}
                  <Layers
                    class="size-3.5"
                    style="color: rgba(255,255,255,0.5)"
                  />
                {:else}
                  <Folder
                    class="size-3.5"
                    style="color: rgba(255,255,255,0.5)"
                  />
                {/if}
              </div>

              <div class="min-w-0 flex-1">
                <p
                  class="text-sm font-medium leading-snug truncate"
                  style="color: white"
                >
                  {r.name}
                </p>
                {#if r.parentName}
                  <p
                    class="text-xs truncate mt-0.5"
                    style="color: rgba(255,255,255,0.5)"
                  >
                    у {r.parentName}
                  </p>
                {/if}
              </div>
            </button>
          {/each}
        {:else if showEmpty}
          <div class="flex flex-col items-center py-10 gap-2">
            <Search class="size-8" style="color: rgba(255,255,255,0.2)" />
            <p class="text-sm text-center" style="color: rgba(255,255,255,0.6)">
              Нічого не знайдено для
              <span class="font-medium" style="color: white"
                >«{searchValue}»</span
              >
            </p>
            <p class="text-xs" style="color: rgba(255,255,255,0.4)">
              Спробуйте інший запит
            </p>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  /* ─── Hover на результат ─── */
  .result-item {
    background-color: transparent;
  }
  .result-item:hover,
  .result-item.active {
    background-color: rgba(255, 255, 255, 0.05);
  }

  /* ─── Hover на хрестик ─── */
  .hover-clear:hover {
    background-color: rgba(255, 255, 255, 0.08);
  }

  /* ─── Скрол ─── */
  .header-search-scroll {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
    overscroll-behavior: contain;
  }
  .header-search-scroll::-webkit-scrollbar {
    width: 6px;
  }
  .header-search-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .header-search-scroll::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 999px;
  }
  .header-search-scroll::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.25);
  }
</style>
