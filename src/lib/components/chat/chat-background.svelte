<!-- src/lib/components/chat/chat-background.svelte -->
<script lang="ts">
  /**
   * Обои чата: узор из SVG, размноженный плиткой через createPattern.
   *
   * Раньше под узором лежал ещё и mesh-градиент, нарисованный вручную по
   * пикселям. Его убрали: чат — рабочий экран, а не заставка, и цветное
   * пятно под сообщениями спорило с акцентом темы. Осталась одна плитка
   * поверх фона панели.
   *
   * Цвет узора берётся из CSS-переменной, а не из пропсов: палитра лежит
   * рядом с остальными токенами темы, JS её только читает.
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

  function readVar(name: string): string {
    return root ? getComputedStyle(root).getPropertyValue(name).trim() : ''
  }

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

  /**
   * Готовим одну плитку нужного цвета.
   *
   * Пути в SVG чёрные и без fill, перекрасить их при отрисовке нельзя.
   * Поэтому рисуем силуэт, а затем source-in заливает цветом только
   * непрозрачные пиксели — получается перекрашенная плитка. Без этого
   * в тёмной теме узор был бы чёрным по чёрному.
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

  async function draw() {
    if (!canvas || !root) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let img: HTMLImageElement
    try {
      img = await loadPattern()
    } catch (err) {
      // Фон — украшение: не загрузился, остаётся чистая заливка панели
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

    const tile = buildTile(img, readVar('--pattern-ink') || '#000000')
    const pattern = ctx.createPattern(tile, 'repeat')
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
    const resizeObserver = new ResizeObserver(() => draw())
    resizeObserver.observe(root)

    // Смена темы правит CSS-переменные, но реактивность Svelte не трогает
    const themeObserver = new MutationObserver(() => draw())
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
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .wallpaper {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;

    /* Светлая тема */
    --pattern-ink: #131313;
    --pattern-opacity: 0.06;
  }

  :global(.dark) .wallpaper {
    --pattern-ink: #ffffff;
    --pattern-opacity: 0.05;
  }

  canvas {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    opacity: var(--pattern-opacity);
  }
</style>
