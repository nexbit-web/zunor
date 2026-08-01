<!-- src/lib/components/chat/chat-background.svelte -->
<script lang="ts">
  /**
   * Обои чата: два канваса, как в Telegram Web.
   *   1) mesh-градиент 50×50, растянутый средствами CSS
   *   2) узор из SVG, размноженный плиткой через createPattern
   *
   * Цвета берутся из CSS-переменных, а не из пропсов: палитра лежит рядом
   * с остальными токенами темы, JS её только читает.
   */

  interface Rgb {
    r: number
    g: number
    b: number
  }

  // ═══════════ Константы ═══════════

  /** Канвас градиента намеренно крошечный: плавность даёт апскейл браузером.
      Рисовать в полный размер — те же данные, но в тысячу раз больше пикселей. */
  const MESH_SIZE = 50

  /** Ширина одной плитки узора в CSS-пикселях */
  const TILE_WIDTH = 500
  /** Пропорции исходника: 1440 × 2960 */
  const TILE_RATIO = 2960 / 1440

  const PATTERN_SRC = '/chat-pattern.svg'

  /** Точки, в которых «стоят» цвета градиента */
  const MESH_POINTS = [
    { x: 0.8, y: 0.1 },
    { x: 0.35, y: 0.25 },
    { x: 0.2, y: 0.9 },
    { x: 0.65, y: 0.75 },
  ] as const

  // ═══════════ Состояние ═══════════

  let root = $state<HTMLDivElement | undefined>(undefined)
  let meshCanvas = $state<HTMLCanvasElement | undefined>(undefined)
  let patternCanvas = $state<HTMLCanvasElement | undefined>(undefined)

  /** Загруженный SVG. Держим между перерисовками, чтобы не тянуть заново. */
  let patternImage: HTMLImageElement | null = null

  // ═══════════ Утилиты ═══════════

  function readVar(name: string): string {
    return root ? getComputedStyle(root).getPropertyValue(name).trim() : ''
  }

  function parseHex(value: string): Rgb {
    const raw = value.replace('#', '')
    const hex =
      raw.length === 3
        ? raw
            .split('')
            .map((c) => c + c)
            .join('')
        : raw
    const n = Number.parseInt(hex, 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }

  /** Ограничиваем DPR: на 3x-экранах выигрыш незаметен, памяти вдвое больше */
  function dpr(): number {
    return Math.min(window.devicePixelRatio || 1, 2)
  }

  // ═══════════ Градиент ═══════════

  /**
   * Обратное взвешивание по расстоянию: каждый пиксель — смесь четырёх
   * цветов, вклад каждого падает как четвёртая степень расстояния.
   * Лёгкое закручивание к центру размывает стыки между пятнами.
   */
  function drawMesh() {
    if (!meshCanvas) return
    const ctx = meshCanvas.getContext('2d')
    if (!ctx) return

    const colors = ['--mesh-1', '--mesh-2', '--mesh-3', '--mesh-4'].map((name) =>
      parseHex(readVar(name)),
    )
    if (colors.some((c) => Number.isNaN(c.r))) return

    const image = ctx.createImageData(MESH_SIZE, MESH_SIZE)
    const px = image.data
    let offset = 0

    for (let y = 0; y < MESH_SIZE; y++) {
      const dy0 = y / MESH_SIZE - 0.5

      for (let x = 0; x < MESH_SIZE; x++) {
        const dx0 = x / MESH_SIZE - 0.5

        const radius = Math.sqrt(dx0 * dx0 + dy0 * dy0)
        const swirl = 0.35 * radius
        const theta = swirl * swirl * 6.4
        const sin = Math.sin(theta)
        const cos = Math.cos(theta)

        const sx = Math.min(1, Math.max(0, 0.5 + dx0 * cos - dy0 * sin))
        const sy = Math.min(1, Math.max(0, 0.5 + dx0 * sin + dy0 * cos))

        let total = 0
        let r = 0
        let g = 0
        let b = 0

        for (let i = 0; i < colors.length; i++) {
          const dx = sx - MESH_POINTS[i].x
          const dy = sy - MESH_POINTS[i].y
          const base = Math.max(0, 0.9 - Math.sqrt(dx * dx + dy * dy))
          const weight = base * base * base * base

          total += weight
          r += weight * colors[i].r
          g += weight * colors[i].g
          b += weight * colors[i].b
        }

        px[offset++] = r / total
        px[offset++] = g / total
        px[offset++] = b / total
        px[offset++] = 255
      }
    }

    ctx.putImageData(image, 0, 0)
  }

  // ═══════════ Узор ═══════════

  function loadPattern(): Promise<HTMLImageElement> {
    if (patternImage) return Promise.resolve(patternImage)

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        patternImage = img
        resolve(img)
      }
      img.onerror = () => reject(new Error(`Не завантажився ${PATTERN_SRC}`))
      img.src = PATTERN_SRC
    })
  }

  /**
   * Готовим одну плитку нужного цвета.
   *
   * Пути в SVG чёрные и без fill, перекрасить их при отрисовке нельзя.
   * Поэтому рисуем силуэт, а затем source-in заливает цветом только
   * непрозрачные пиксели — получается перекрашенная плитка.
   */
  function buildTile(img: HTMLImageElement, ink: string): HTMLCanvasElement {
    const scale = dpr()
    const tile = document.createElement('canvas')
    tile.width = Math.round(TILE_WIDTH * scale)
    tile.height = Math.round(TILE_WIDTH * TILE_RATIO * scale)

    const ctx = tile.getContext('2d')
    if (ctx) {
      ctx.drawImage(img, 0, 0, tile.width, tile.height)
      ctx.globalCompositeOperation = 'source-in'
      ctx.fillStyle = ink
      ctx.fillRect(0, 0, tile.width, tile.height)
    }

    return tile
  }

  async function drawPattern() {
    if (!patternCanvas || !root) return

    const ctx = patternCanvas.getContext('2d')
    if (!ctx) return

    let img: HTMLImageElement
    try {
      img = await loadPattern()
    } catch (err) {
      // Фон — украшение: не загрузился, остаётся чистый градиент
      console.error('[chat-background]', err)
      return
    }

    // Пока грузилась картинка, компонент мог размонтироваться
    if (!patternCanvas || !root) return

    const scale = dpr()
    const width = Math.round(root.clientWidth * scale)
    const height = Math.round(root.clientHeight * scale)
    if (width === 0 || height === 0) return

    patternCanvas.width = width
    patternCanvas.height = height

    const tile = buildTile(img, readVar('--pattern-ink') || '#000000')
    const pattern = ctx.createPattern(tile, 'repeat')
    if (!pattern) return

    // Плитка уже в device-пикселях, поэтому заливаем без доп. трансформаций
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, width, height)
  }

  // ═══════════ Жизненный цикл ═══════════

  $effect(() => {
    if (!root) return

    drawMesh()
    drawPattern()

    // Размер меняется — плитку надо разложить заново на новую площадь
    const resizeObserver = new ResizeObserver(() => drawPattern())
    resizeObserver.observe(root)

    // Смена темы правит CSS-переменные, но реактивность Svelte не трогает
    const themeObserver = new MutationObserver(() => {
      drawMesh()
      drawPattern()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => {
      resizeObserver.disconnect()
      themeObserver.disconnect()
    }
  })
</script>

<div bind:this={root} class="wallpaper" aria-hidden="true">
  <canvas
    bind:this={meshCanvas}
    width={MESH_SIZE}
    height={MESH_SIZE}
    class="mesh"
  ></canvas>
  <canvas bind:this={patternCanvas} class="pattern"></canvas>
</div>

<style>
  .wallpaper {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
    /* Блендинг узора не должен утекать выше по дереву */
    isolation: isolate;

    /* Светлая тема */
    --mesh-1: #dfe2b8;
    --mesh-2: #d2d78d;
    --mesh-3: #87b58b;
    --mesh-4: #a9c78d;
    --pattern-ink: #1e3b22;
    --pattern-opacity: 0.5;
  }

  :global(.dark) .wallpaper {
    --mesh-1: #4a4260;
    --mesh-2: #2b2438;
    --mesh-3: #1c1a24;
    --mesh-4: #3a3050;
    --pattern-ink: #ffffff;
    --pattern-opacity: 0.14;
  }

  .mesh,
  .pattern {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
  }

  .pattern {
    opacity: var(--pattern-opacity);
    /* soft-light мягко ложится на градиент, а не забивает его плоским цветом */
    mix-blend-mode: soft-light;
  }
</style>



<!-- src/lib/components/chat/chat-background.svelte
<script lang="ts">
  /**
   * Обои чата: узор из SVG, размноженный плиткой через createPattern.
   * Без цвета — SVG рисуется как есть, поверх того, что лежит под ним.
   */

  /** Ширина одной плитки узора в CSS-пикселях */
  const TILE_WIDTH = 500
  /** Пропорции исходника: 1440 × 2960 */
  const TILE_RATIO = 2960 / 1440

  const PATTERN_SRC = '/chat-pattern.svg'

  let root = $state<HTMLDivElement | undefined>(undefined)
  let canvas = $state<HTMLCanvasElement | undefined>(undefined)

  /** Загруженный SVG. Держим между перерисовками, чтобы не тянуть заново. */
  let patternImage: HTMLImageElement | null = null

  /** Ограничиваем DPR: на 3x-экранах выигрыш незаметен, памяти вдвое больше */
  function dpr(): number {
    return Math.min(window.devicePixelRatio || 1, 2)
  }

  function loadPattern(): Promise<HTMLImageElement> {
    if (patternImage) return Promise.resolve(patternImage)

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        patternImage = img
        resolve(img)
      }
      img.onerror = () => reject(new Error(`Не завантажився ${PATTERN_SRC}`))
      img.src = PATTERN_SRC
    })
  }

  /** Плитка нужного размера. Цвет не трогаем — как в исходнике. */
  function buildTile(img: HTMLImageElement): HTMLCanvasElement {
    const scale = dpr()
    const tile = document.createElement('canvas')
    tile.width = Math.round(TILE_WIDTH * scale)
    tile.height = Math.round(TILE_WIDTH * TILE_RATIO * scale)

    tile.getContext('2d')?.drawImage(img, 0, 0, tile.width, tile.height)
    return tile
  }

  async function draw() {
    if (!canvas || !root) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let img: HTMLImageElement
    try {
      img = await loadPattern()
    } catch (err) {
      // Фон — украшение: не загрузился, просто ничего не рисуем
      console.error('[chat-background]', err)
      return
    }

    // Пока грузилась картинка, компонент мог размонтироваться
    if (!canvas || !root) return

    const scale = dpr()
    const width = Math.round(root.clientWidth * scale)
    const height = Math.round(root.clientHeight * scale)
    if (width === 0 || height === 0) return

    canvas.width = width
    canvas.height = height

    const pattern = ctx.createPattern(buildTile(img), 'repeat')
    if (!pattern) return

    // Плитка уже в device-пикселях, поэтому заливаем без доп. трансформаций
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, width, height)
  }

  $effect(() => {
    if (!root) return

    draw()

    // Размер меняется — плитку надо разложить заново на новую площадь
    const observer = new ResizeObserver(() => draw())
    observer.observe(root)

    return () => observer.disconnect()
  })
</script>

<div bind:this={root} class="wallpaper" aria-hidden="true">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .wallpaper {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
  }

  canvas {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    opacity: 0.1;
  }
</style> -->