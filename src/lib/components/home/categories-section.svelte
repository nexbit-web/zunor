<!-- src/lib/components/home/categories-section.svelte -->
<script lang="ts">
  import { Skeleton } from '$lib/components/ui/skeleton'
  import { onMount } from 'svelte'
  import { ArrowRight, RotateCcw } from 'lucide-svelte'
  import { preloadData } from '$app/navigation'
  import { getCategoryIcon } from '$lib/icons/category-icons'

  const VISIBLE_LIMIT = 9

  interface Category {
    id: string
    slug: string
    name: string
    icon: string | null
  }

  // ─── Локальное состояние вместо store ───
  let categories = $state<Category[]>([])
  let loaded = $state(false)
  let error = $state<string | null>(null)

  const visibleCategories = $derived(categories.slice(0, VISIBLE_LIMIT))

  async function loadCategories() {
    try {
      error = null
      const res = await fetch('/api/categories')
      if (!res.ok) throw new Error('Не вдалось завантажити категорії')
      const data = await res.json()
      categories = data.categories ?? []
      loaded = true
    } catch (err) {
      error = err instanceof Error ? err.message : 'Помилка завантаження'
    }
  }

  function reloadCategories() {
    loaded = false
    loadCategories()
  }

  // ─── Prefetch при hover ───
  const prefetched = new Set<string>()
  function prefetchCategory(slug: string) {
    if (prefetched.has(slug)) return
    prefetched.add(slug)
    preloadData(`/jobs/new?category=${slug}`).catch(() => {
      prefetched.delete(slug)
    })
  }

  let sectionEl: HTMLElement | undefined = $state()

  onMount(() => {
    if (!sectionEl) return

    // Lazy-load: загружаем когда секция появится в viewport
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadCategories()
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )

    observer.observe(sectionEl)

    return () => observer.disconnect()
  })
</script>

<section
  bind:this={sectionEl}
  class="py-24"
  style="background-color: var(--background)"
>
  <div class="max-w-6xl mx-auto px-6">
    <!-- ─── Заголовок ─── -->
    <div class="mb-20">
      <h2
        class="text-4xl md:text-6xl font-bold tracking-tighter mb-8"
        style="color: var(--foreground)"
      >
        Категорії
      </h2>
      <div class="h-1.5 w-24" style="background-color: var(--primary)"></div>
    </div>

    <!-- ─── Сітка ─── -->
    {#if error && !loaded}
      <div
        class="flex flex-col items-center gap-3 py-16 rounded-[1.5rem]"
        style="background-color: var(--card); border: 1px solid var(--border)"
        role="alert"
      >
        <p class="text-sm" style="color: var(--muted-foreground)">{error}</p>
        <button
          type="button"
          onclick={reloadCategories}
          class="inline-flex items-center gap-1.5 text-sm font-medium hover:underline cursor-pointer"
          style="color: var(--primary)"
        >
          <RotateCcw class="size-3.5" aria-hidden="true" />
          Спробувати ще
        </button>
      </div>
    {:else}
      <div
        class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
      >
        {#if !loaded}
          {#each Array(VISIBLE_LIMIT + 1) as _, i (i)}
            <Skeleton class="h-[180px] rounded-[1.5rem]" />
          {/each}
        {:else}
          {#each visibleCategories as cat (cat.slug)}
            {@const Icon = getCategoryIcon(cat.icon)}
            <a
              href="/jobs/new?category={cat.slug}"
              data-sveltekit-preload-data="hover"
              onmouseenter={() => prefetchCategory(cat.slug)}
              onfocus={() => prefetchCategory(cat.slug)}
              class="group flex flex-col items-center p-8 h-[180px] rounded-[1.5rem] border transition-all duration-300 hover:bg-[var(--accent)]"
              style="background-color: var(--card); border-color: var(--border);"
              aria-label="Категорія: {cat.name}"
            >
              <div
                class="flex-1 flex items-start justify-center pt-2 transition-transform duration-300 group-hover:scale-110"
              >
                <Icon
                  size={55}
                  strokeWidth={1}
                  style="color: var(--foreground)"
                  aria-hidden="true"
                />
              </div>

              <span
                class="text-[17px] font-bold tracking-tight text-center line-clamp-2 leading-tight"
                style="color: var(--foreground)"
              >
                {cat.name}
              </span>
            </a>
          {/each}

          <!-- Кнопка "Створити заявку" -->
          <a
            href="/jobs/new"
            data-sveltekit-preload-data="hover"
            class="group flex flex-col items-center p-8 h-[180px] rounded-[1.5rem] border transition-all duration-300 hover:bg-[var(--accent)]"
            style="background-color: var(--card); border-color: var(--border);"
            aria-label="Створити заявку"
          >
            <div
              class="flex-1 flex items-start justify-center pt-2 transition-transform duration-300 group-hover:translate-x-2"
            >
              <ArrowRight
                size={52}
                strokeWidth={1}
                style="color: var(--foreground)"
                aria-hidden="true"
              />
            </div>
            <span
              class="text-[15px] font-bold tracking-tight text-center"
              style="color: var(--foreground)"
            >
              Створити заявку
            </span>
          </a>
        {/if}
      </div>
    {/if}
  </div>
</section>

<style>
  a {
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
  }

  a:hover {
    border-color: var(--primary) !important;
    transform: translateY(-4px);
  }

  :global(.dark) a:hover {
    background-color: var(--catalog-sidebar-hover) !important;
  }

  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-clamp: 2;
    overflow: hidden;
  }
</style>
