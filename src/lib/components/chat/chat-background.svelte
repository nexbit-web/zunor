<script lang="ts">
  /**
   * Обои чата, как в Telegram: два канваса.
   *   1) mesh-градиент 50×50, растянутый средствами CSS (только светлая тема);
   *   2) узор из SVG, размноженный плиткой через createPattern.
   *
   * В тёмной теме градиента нет — тёмный экран с цветным пятном спорил бы
   * с акцентом, — остаётся тихий белый узор поверх фона страницы.
   *
   * Цвета берутся из CSS-переменных, а не из пропсов: палитра лежит рядом
   * с остальными токенами темы, JS её только читает.
   */

  interface Rgb {
    r: number
    g: number
    b: number
  }

  /** Канвас градиента намеренно крошечный: плавность даёт апскейл браузером.
      Рисовать в полный размер — те же данные, но в тысячу раз больше пикселей. */
  const MESH_SIZE = 50

  /** Ширина одной плитки узора в CSS-пикселях — шаг узора как в Telegram */
  const TILE_WIDTH = 540
  /** Пропорции исходника: 1440 × 2960 */
  const TILE_RATIO = 2960 / 1440

  const PATTERN_SRC = '/chat-pattern.svg'

  /**
   * Точки, в которых «стоят» цвета --mesh-1…4. Это точки Telegram Web,
   * отражённые по вертикали: с ними его стандартная палитра ложится так
   * же, как у него, — жёлтый в левом верхнем углу, светлое пятно в правом
   * нижнем, зелёная полоса по диагонали. Сверено рендером со скриншотом.
   */
  const MESH_POINTS = [
    { x: 0.8, y: 0.9 },
    { x: 0.35, y: 0.75 },
    { x: 0.2, y: 0.1 },
    { x: 0.65, y: 0.25 },
  ] as const

  let root = $state<HTMLDivElement | undefined>(undefined)
  let meshCanvas = $state<HTMLCanvasElement | undefined>(undefined)
  let patternCanvas = $state<HTMLCanvasElement | undefined>(undefined)

  /** Загруженный SVG. Держим между перерисовками, чтобы не тянуть заново. */
  let patternImage: HTMLImageElement | null = null

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

  /**
   * Обратное взвешивание по расстоянию: каждый пиксель — смесь четырёх
   * цветов, вклад каждого падает как четвёртая степень расстояния.
   * Лёгкое закручивание к центру размывает стыки между пятнами.
   */
  function drawMesh() {
    if (!meshCanvas) return
    const ctx = meshCanvas.getContext('2d')
    if (!ctx) return

    const colors = ['--mesh-1', '--mesh-2', '--mesh-3', '--mesh-4'].map(
      (name) => parseHex(readVar(name)),
    )
    // Тёмная тема переменных не задаёт — канвас там и так скрыт
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

    /* Светлая тема — стандартная палитра Telegram */
    --mesh-1: #dbddbb;
    --mesh-2: #6ba587;
    --mesh-3: #d5d88d;
    --mesh-4: #88b884;
    --pattern-ink: #000000;
    --pattern-opacity: 0.5;
    /* soft-light темнит линии одинаково и на жёлтом, и на зелёном —
       overlay на тёмной полосе делал их почти чёрными */
    --pattern-blend: soft-light;
  }

  :global(.dark) .wallpaper {
    --pattern-ink: #ffffff;
    --pattern-opacity: 0.05;
    --pattern-blend: normal;
  }

  :global(.dark) .mesh {
    display: none;
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
    mix-blend-mode: var(--pattern-blend);
  }
</style>
