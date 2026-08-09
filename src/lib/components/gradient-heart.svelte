<script lang="ts">
  import { onMount } from 'svelte'

  let canvasEl: HTMLCanvasElement | undefined
  let {
    size = 420,
    blur = 28,
    stretchWidth = size,
    stretchHeight = size,
  }: {
    size?: number
    blur?: number
    /** Реальна ширина/висота у CSS-пікселях, до якої розтягується canvas
        (сам малюнок серця залишається пропорційним у `size`). */
    stretchWidth?: number
    stretchHeight?: number
  } = $props()

  function drawHeart(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.clearRect(0, 0, w, h)

    const gradient = ctx.createLinearGradient(w * 0.15, 0, w * 0.55, h)
    gradient.addColorStop(0, '#1f5aff')
    gradient.addColorStop(0.35, '#6d36f7')
    gradient.addColorStop(0.65, '#ff4da6')
    gradient.addColorStop(1, '#ff8b1f')

    const cx = w / 2
    const cy = h / 2
    const scale = (Math.min(w, h) / 24) * 0.72

    ctx.save()
    ctx.translate(cx, cy - 3 * scale)
    ctx.scale(scale, scale)

    ctx.beginPath()
    ctx.moveTo(0, 3)
    ctx.bezierCurveTo(0, 0, -1.2, -6, -3.8, -6)
    ctx.bezierCurveTo(-6.8, -6, -8.5, -3, -8.5, 1)
    ctx.bezierCurveTo(-8.5, 7, -4, 11, 0, 17.5)
    ctx.bezierCurveTo(4, 11, 8.5, 7, 8.5, 1)
    ctx.bezierCurveTo(8.5, -3, 6.8, -6, 3.8, -6)
    ctx.bezierCurveTo(1.2, -6, 0, 0, 0, 3)
    ctx.closePath()
    ctx.restore()

    ctx.fillStyle = gradient
    ctx.fill()
  }

  onMount(() => {
    if (!canvasEl) return
    const ctx = canvasEl.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    // Роздільна здатність canvas береться з базового `size` (для якості
    // малюнка), а розтягування до потрібних розмірів робить сам CSS —
    // так можна "розтягнути" фігуру на весь екран без втрати
    // продуктивності (не рендеримо піксель-в-піксель на весь viewport).
    canvasEl.width = size * dpr
    canvasEl.height = size * dpr
    ctx.scale(dpr, dpr)

    drawHeart(ctx, size, size)
  })
</script>

<canvas
  bind:this={canvasEl}
  aria-label="Градієнтне серце"
  style="width: {stretchWidth}px; height: {stretchHeight}px; filter: blur({blur}px); opacity: 0.9;"
></canvas>
