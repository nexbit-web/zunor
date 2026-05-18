<script lang="ts">
  import {
    Search,
    X,
    ArrowRight,
    LoaderCircle,
    Layers,
    Folder,
  } from 'lucide-svelte'
  import { fly, fade } from 'svelte/transition'
  import { backOut } from 'svelte/easing'
  import { onMount, onDestroy } from 'svelte'
  import { goto } from '$app/navigation'
  import Button from '../ui/button/button.svelte'

  // ─── Типи ───
  interface SearchResult {
    type: 'category' | 'subcategory'
    slug: string
    name: string
    parentSlug?: string
    parentName?: string
    icon?: string | null
  }

  const popularTags = ['AI', 'Логотип', 'SEO', 'Ремонт', 'Перевезення']
  const placeholders = [
    'Полагодити кран...',
    'Розробити сайт...',
    'Зробити логотип...',
  ]

  let placeholderIndex = $state(0)
  let placeholderVisible = $state(true)
  let mounted = $state(false)

  // ─── Search state ───
  let searchValue = $state('')
  let inputEl = $state<HTMLInputElement | undefined>(undefined)
  let containerEl = $state<HTMLDivElement | undefined>(undefined)

  let results = $state<SearchResult[]>([])
  let loading = $state(false)
  let highlightedIndex = $state(-1)

  // ─── Явний контроль меню ───
  // НЕ залежить від focused — це і ламало все. Меню керується явно:
  // відкривається коли є валідний запит, закривається коли:
  //  - юзер натиснув Escape
  //  - юзер клікнув ПОЗА компонентом
  //  - юзер вибрав результат (відкривається перехід)
  //  - searchValue став < QUERY_MIN символів
  let menuOpen = $state(false)

  // ─── Debounce + кеш + abort ───
  let searchTimer: ReturnType<typeof setTimeout> | null = null
  let abortController: AbortController | null = null
  let activeRequestId = 0 // захист від race conditions
  const cache = new Map<string, SearchResult[]>()
  const CACHE_MAX_SIZE = 100

  const DEBOUNCE_MS = 400
  const QUERY_MIN = 2

  function cacheSet(key: string, value: SearchResult[]) {
    if (cache.size >= CACHE_MAX_SIZE) {
      const firstKey = cache.keys().next().value
      if (firstKey) cache.delete(firstKey)
    }
    cache.set(key, value)
  }

  async function performSearch(query: string) {
    const q = query.trim()

    if (q.length < QUERY_MIN) {
      results = []
      loading = false
      highlightedIndex = -1
      menuOpen = false
      return
    }

    // ─── Cache hit ───
    const cached = cache.get(q.toLowerCase())
    if (cached) {
      results = cached
      loading = false
      highlightedIndex = -1
      menuOpen = true
      return
    }

    // ─── Race protection ───
    // Кожен запит отримує свій ID. Якщо до нашого finally прийшов новіший запит —
    // ігноруємо результат. Це додатковий захист поверх AbortController.
    const requestId = ++activeRequestId

    // Скасовуємо попередній запит
    if (abortController) abortController.abort()
    abortController = new AbortController()

    loading = true
    menuOpen = true // відкриваємо меню одразу — буде показаний loading-стан

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: abortController.signal,
      })

      // Якщо за час запиту юзер ввів нові символи — ігноруємо
      if (requestId !== activeRequestId) return

      if (!res.ok) {
        results = []
        return
      }

      const data: { results: SearchResult[] } = await res.json()

      // Ще раз перевіряємо актуальність — JSON міг парситись довго
      if (requestId !== activeRequestId) return

      results = data.results ?? []
      cacheSet(q.toLowerCase(), results)
      highlightedIndex = -1
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      if (requestId !== activeRequestId) return
      console.error('[search] failed:', err)
      results = []
    } finally {
      // Loading знімаємо тільки якщо це актуальний запит
      if (requestId === activeRequestId) {
        loading = false
      }
    }
  }

  function handleInput() {
    if (searchTimer) clearTimeout(searchTimer)

    const q = searchValue.trim()
    if (q.length < QUERY_MIN) {
      // Миттєво очищаємо без debounce
      results = []
      loading = false
      menuOpen = false
      highlightedIndex = -1
      // Скасовуємо будь-який pending запит
      if (abortController) abortController.abort()
      activeRequestId++ // інвалідуємо
      return
    }

    // Відкриваємо меню одразу — поки результати чекаються, юзер бачить loading
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
    inputEl?.focus()
  }

  function closeMenu() {
    menuOpen = false
    highlightedIndex = -1
  }

  function reopenMenuIfNeeded() {
    // При фокусі повертаємо меню, якщо є валідний запит з результатами
    if (searchValue.trim().length >= QUERY_MIN && results.length > 0) {
      menuOpen = true
    } else if (searchValue.trim().length >= QUERY_MIN) {
      // Якщо немає результатів, але є запит — пробуємо ще раз
      performSearch(searchValue)
    }
  }

  // ─── Click outside ───
  function handleClickOutside(e: MouseEvent) {
    if (!containerEl) return
    const target = e.target as Node
    if (!containerEl.contains(target)) {
      closeMenu()
    }
  }

  // ─── Keyboard navigation ───
  function onKeydown(e: KeyboardEvent) {
    // Працює тільки коли input у фокусі
    if (document.activeElement !== inputEl) return

    if (!menuOpen) {
      if (e.key === 'ArrowDown' && results.length > 0) {
        menuOpen = true
        e.preventDefault()
      }
      return
    }

    if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault()
      highlightedIndex = (highlightedIndex + 1) % results.length
    } else if (e.key === 'ArrowUp' && results.length > 0) {
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
      inputEl?.blur()
    }
  }

  function navigateToResult(r: SearchResult) {
    closeMenu()
    if (r.type === 'category') {
      goto(`/services/${r.slug}`)
    } else {
      goto(`/services/${r.parentSlug}?sub=${r.slug}`)
    }
  }

  function navigateToFallback(query: string) {
    closeMenu()
    goto(`/services?q=${encodeURIComponent(query)}`)
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

  // ─── Mount/Destroy ───
  onMount(() => {
    mounted = true

    const interval = setInterval(() => {
      placeholderVisible = false
      setTimeout(() => {
        placeholderIndex = (placeholderIndex + 1) % placeholders.length
        placeholderVisible = true
      }, 250)
    }, 3000)

    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      clearInterval(interval)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  })

  onDestroy(() => {
    if (searchTimer) clearTimeout(searchTimer)
    if (abortController) abortController.abort()
  })
</script>

<svelte:window onkeydown={onKeydown} />

<section
  class="relative flex flex-col justify-center items-center overflow-visible z-40 select-none px-4"
  style="background-color: var(--background); height: 90vh;"
>
  {#if mounted}
    <div
      in:fade={{ duration: 400 }}
      class="absolute inset-0 pointer-events-none opacity-[0.04]"
      style="background-image: linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px); background-size: 40px 40px;"
    ></div>
  {/if}

  <div
    class="max-w-4xl mx-auto w-full relative z-10 flex flex-col items-center text-center"
  >
    {#if mounted}
      <!-- Бейдж -->
      <div
        in:fly={{ y: -8, duration: 300, delay: 0, easing: backOut }}
        class="flex items-center gap-2 mb-6 px-3 py-1 rounded-full border border-[var(--border)] bg-[var(--card)]"
      >
        <span class="relative flex h-2 w-2">
          <span
            class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"
          ></span>
          <span class="relative inline-flex h-2 w-2 rounded-full bg-green-500"
          ></span>
        </span>
        <span
          class="text-[10px] font-bold uppercase tracking-widest opacity-60"
          style="color: var(--foreground)">онлайн</span
        >
        <span class="w-px h-3 opacity-20 bg-current"></span>
        <span
          class="text-[10px] font-bold uppercase tracking-widest text-[#008e60]"
          >24/7</span
        >
      </div>

      <!-- Заголовок -->
      <h1
        in:fly={{ y: 16, duration: 350, delay: 80, easing: backOut }}
        class="text-4xl md:text-7xl font-bold tracking-tighter leading-tight md:leading-none mb-5"
        style="color: var(--foreground); letter-spacing: -0.04em;"
      >
        <span class="text-[#008e60]">Онлайн-сервіс</span><br />замовлення послуг
      </h1>

      <!-- Підзаголовок -->
      <p
        in:fly={{ y: 10, duration: 300, delay: 160 }}
        class="text-xs md:text-base opacity-30 font-medium mb-10 whitespace-nowrap"
        style="color: var(--foreground)"
      >
        Надійні фахівці для вашого бізнесу та дому.
      </p>

      <!-- CTA -->
      <a
        href="/jobs/new"
        in:fly={{ y: 10, duration: 300, delay: 230, easing: backOut }}
        class="cta-btn"
      >
        Замовити послугу
      </a>
    {/if}
  </div>

  <!-- Scroll indicator -->
  <div class="absolute bottom-6 left-1/2 -translate-x-1/2 opacity-15">
    <div class="w-px h-8 bg-current"></div>
  </div>
</section>

<style>
  .cta-btn {
    position: relative;
    overflow: hidden;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 18px 40px;
    font-size: 18px;
    font-weight: 500;
    color: #fff;
    background: #008e60;
    border: none;
    border-radius: 14px;
    cursor: pointer;
    transition:
      transform 0.2s,
      box-shadow 0.25s;
  }
  .cta-btn:hover {
    transform: translateY(-2px);
    box-shadow:
      0 0 20px 4px rgba(0, 142, 96, 0.45),
      0 0 60px 14px rgba(0, 142, 96, 0.15);
  }
  .cta-btn:active {
    transform: scale(0.97);
    box-shadow: none;
  }
  .cta-btn::after {
    content: '';
    position: absolute;
    top: 0;
    left: -80%;
    width: 60%;
    height: 100%;
    background: linear-gradient(
      100deg,
      transparent 20%,
      rgba(255, 255, 255, 0.18) 50%,
      transparent 80%
    );
    animation: shimmer 2.4s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes shimmer {
    0% {
      left: -80%;
    }
    100% {
      left: 140%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .cta-btn::after {
      animation: none;
    }
  }
</style>
