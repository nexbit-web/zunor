<script lang="ts">
  // Редактор фото профілю перед завантаженням — у дусі редактора
  // Telegram: темна сцена, квадратна рамка з точками на кутах і сіткою
  // третин, коло всередині (що в колі — те й буде аватаром), лінійка
  // нахилу знизу, поворот на 90° і віддзеркалення.
  //
  //   • фото тягнуть пальцем чи мишею, наближають щипком чи коліщатком;
  //   • кут рамки тягнуть усередину — рамка меншає, а відпущена плавно
  //     розтягується на всю сцену разом із виділеним (так наближають
  //     конкретне місце);
  //   • лінійка — нахил ±45°, біля нуля «прилипає» до рівного.
  //
  // Обрізаємо В БРАУЗЕРІ: на сервер іде готовий квадрат до 1024px у JPEG,
  // а не 12-мегапіксельний оригінал. Завантаження швидше, і в хмарі не
  // лежить те, чого людина свідомо не показувала (решта кадру).
  //
  // Фото завжди накриває коло повністю, і з нахилом теж — порожніх кутів
  // в аватарі не буде. За межею фото «пружинить» (опір, як у iOS), а
  // відпущене — плавно повертається.
  //
  // Модель: (u, v) — зсув точки фото, що стоїть у центрі кола, від
  // центру фото, у пікселях показу й у власних осях фото (до повороту й
  // віддзеркалення). У цих осях межі прості: квадрат кола, повернутий на
  // кут, займає прямокутник зі стороною crop·(|cos|+|sin|), і він мусить
  // уміститись у фото.

  import { untrack } from 'svelte'
  import * as Dialog from '$lib/components/ui/dialog'
  import { Button } from '$lib/components/ui/button'
  import FlipHorizontal2 from '$lib/components/icons/set/flip-horizontal-2.svelte'
  import RotateCcwSquare from '$lib/components/icons/set/rotate-ccw-square.svelte'

  interface Props {
    /** Обраний файл. Не null — редактор відкритий; закриття скидає в null. */
    file: File | null
    onConfirm: (blob: Blob) => void
  }

  let { file = $bindable(null), onConfirm }: Props = $props()

  /** Відступ рамки від краю сцени: видно, що фото за нею продовжується. */
  const PAD = 24
  /** Найбільше наближення — у стільки разів від «фото рівно в колі». */
  const MAX_ZOOM = 6
  const OUTPUT_MAX = 1024
  /** Найменша рамка, до якої можна стягнути кут. */
  const MIN_FRAME = 72
  const TILT_MAX = 45
  /** Пікселів лінійки на градус. */
  const PX_PER_DEG = 4.5
  const LABELS = [-45, -30, -15, 0, 15, 30, 45]
  const TICKS = Array.from({ length: 37 }, (_, i) => -45 + i * 2.5)

  let dialogEl = $state<HTMLElement | null>(null)
  let stageSize = $state(0)
  let src = $state('')
  let natural = $state({ w: 0, h: 0 })
  let failed = $state(false)
  let image: HTMLImageElement | null = null

  let scale = $state(1)
  let u = $state(0)
  let v = $state(0)
  /** Чверті оберту, накопичувально (−1, −2…): анімація йде коротким шляхом. */
  let turns = $state(0)
  let tilt = $state(0)
  let flipped = $state(false)
  /** Масштаб, який обрала людина: нахил збільшує фото лише на час нахилу. */
  let chosenScale = 1
  /** Рамка, поки тягнуть кут (координати сцени); null — на всю сцену. */
  let frame = $state<{ x: number; y: number; size: number } | null>(null)
  let settling = $state(false)
  let settleTimer: ReturnType<typeof setTimeout> | undefined

  const crop = $derived(Math.max(0, stageSize - PAD * 2))
  const center = $derived(stageSize / 2)
  const angle = $derived(turns * 90 + tilt)
  const rad = $derived((angle * Math.PI) / 180)
  const cos = $derived(Math.cos(rad))
  const sin = $derived(Math.sin(rad))
  const baseScale = $derived(
    natural.w ? crop / Math.min(natural.w, natural.h) : 1,
  )
  const minScale = $derived(baseScale * (Math.abs(cos) + Math.abs(sin)))
  const maxScale = $derived(Math.max(baseScale * MAX_ZOOM, minScale))

  const box = $derived(frame ?? { x: PAD, y: PAD, size: crop })

  // ─── Перетворення: сцена ↔ власні осі фото ───

  /** Вектор сцени → осі фото: M·R(−θ)·d. */
  function toImage(dx: number, dy: number): { x: number; y: number } {
    const x = cos * dx + sin * dy
    return { x: flipped ? -x : x, y: -sin * dx + cos * dy }
  }

  /** Вектор в осях фото → сцена: R(θ)·M·q. */
  function toStage(qx: number, qy: number): { x: number; y: number } {
    const x = flipped ? -qx : qx
    return { x: cos * x - sin * qy, y: sin * x + cos * qy }
  }

  /** Центр фото на сцені. */
  const imageCenter = $derived.by(() => {
    const off = toStage(u, v)
    return { x: center - off.x, y: center - off.y }
  })

  function limits(s: number): { lu: number; lv: number } {
    const side = crop * (Math.abs(cos) + Math.abs(sin))
    return {
      lu: Math.max(0, (natural.w * s - side) / 2),
      lv: Math.max(0, (natural.h * s - side) / 2),
    }
  }

  function clamp(n: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, n))
  }

  function clampOffset(): void {
    const { lu, lv } = limits(scale)
    u = clamp(u, -lu, lu)
    v = clamp(v, -lv, lv)
  }

  /** Опір за межею, як у iOS: що далі тягнеш, то менше фото слухається. */
  function rubber(n: number, lo: number, hi: number): number {
    const dim = crop || 1
    const resist = (d: number) => (1 - 1 / ((d * 0.55) / dim + 1)) * dim
    if (n < lo) return lo - resist(lo - n)
    if (n > hi) return hi + resist(n - hi)
    return n
  }

  function settle(apply: () => void): void {
    settling = true
    apply()
    clearTimeout(settleTimer)
    settleTimer = setTimeout(() => (settling = false), 340)
  }

  // ─── Завантаження файлу ───

  $effect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    const probe = new Image()
    let alive = true
    failed = false

    probe.onload = () => {
      if (!alive) return
      image = probe
      natural = { w: probe.naturalWidth, h: probe.naturalHeight }
      src = url
    }
    // HEIC з iPhone поза Safari, битий файл — браузер не розбере.
    probe.onerror = () => {
      if (alive) failed = true
    }
    probe.src = url

    return () => {
      alive = false
      URL.revokeObjectURL(url)
      image = null
      src = ''
      natural = { w: 0, h: 0 }
    }
  })

  // Нове фото чи інший розмір сцени — все з початку: рівно в колі, по
  // центру, без нахилу.
  $effect(() => {
    if (!natural.w || crop <= 0) return
    untrack(() => {
      turns = 0
      tilt = 0
      flipped = false
      frame = null
      u = 0
      v = 0
      scale = baseScale
      chosenScale = baseScale
    })
  })

  // ─── Масштаб ───

  /**
   * Поставити точку фото qn (у пікселях оригіналу, від центру фото) у
   * точку сцени (px, py) при масштабі s.
   */
  function place(qx: number, qy: number, s: number, px: number, py: number) {
    const c = toImage(center - px, center - py)
    const { lu, lv } = limits(s)
    scale = s
    u = clamp(c.x + qx * s, -lu, lu)
    v = clamp(c.y + qy * s, -lv, lv)
  }

  /** Точка фото під точкою сцени — у пікселях оригіналу від центру фото. */
  function pointAt(px: number, py: number): { x: number; y: number } {
    const q = toImage(px - imageCenter.x, py - imageCenter.y)
    return { x: q.x / scale, y: q.y / scale }
  }

  function zoomAt(next: number, px: number, py: number): void {
    const q = pointAt(px, py)
    place(q.x, q.y, clamp(next, minScale, maxScale), px, py)
    chosenScale = scale
  }

  // ─── Поворот і віддзеркалення ───

  /** Кут змінився: фото крутиться навколо центру кола й, якщо треба,
   *  більшає, щоб накрити коло. Повернули назад — вертається обраний масштаб. */
  function afterRotate(): void {
    const s = Math.max(chosenScale, minScale)
    const k = s / scale
    u *= k
    v *= k
    scale = s
    clampOffset()
  }

  function rotateLeft(): void {
    if (!src) return
    settle(() => {
      turns -= 1
      afterRotate()
    })
  }

  // Дзеркало по горизонталі ЕКРАНА: у моделі це зміна знаку кута плюс
  // віддзеркалення в осях фото. Точка в центрі кола лишається тією ж.
  function flip(): void {
    if (!src) return
    settle(() => {
      flipped = !flipped
      turns = -turns
      tilt = -tilt
      afterRotate()
    })
  }

  function setTilt(next: number): void {
    // «Прилипає» до рівного: точно в нуль пальцем не влучити.
    const t = clamp(next, -TILT_MAX, TILT_MAX)
    tilt = Math.abs(t) < 0.8 ? 0 : Math.round(t * 10) / 10
    afterRotate()
  }

  // ─── Жести на фото ───
  // Один палець / миша — зсув, два пальці — щипок із зсувом. При зміні
  // кількості пальців жест починається заново від поточного стану, інакше
  // фото стрибало б, коли другий палець торкається чи відпускає.

  const pointers = new Map<number, { x: number; y: number }>()
  let gesture: {
    u: number
    v: number
    scale: number
    cx: number
    cy: number
    dist: number
    q: { x: number; y: number }
  } | null = null
  let grabbing = $state(false)

  function stagePoint(e: PointerEvent, el: HTMLElement) {
    const rect = el.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function startGesture(): void {
    const pts = [...pointers.values()]
    grabbing = pts.length > 0
    if (pts.length === 0) {
      gesture = null
      return
    }
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
    const dist =
      pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0
    gesture = { u, v, scale, cx, cy, dist, q: pointAt(cx, cy) }
  }

  function onPointerDown(e: PointerEvent): void {
    if (!natural.w || (e.pointerType === 'mouse' && e.button !== 0)) return
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    settling = false
    pointers.set(e.pointerId, stagePoint(e, el))
    startGesture()
  }

  function onPointerMove(e: PointerEvent): void {
    if (!gesture || !pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, stagePoint(e, e.currentTarget as HTMLElement))

    const pts = [...pointers.values()]
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length

    if (pts.length > 1 && gesture.dist > 0) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const s = clamp((gesture.scale * dist) / gesture.dist, minScale, maxScale)
      // Точка фото, що була під серединою пальців, лишається під нею.
      place(gesture.q.x, gesture.q.y, s, cx, cy)
      chosenScale = scale
      return
    }

    // Фото їде за пальцем — точка в центрі кола зсувається навпаки.
    const d = toImage(cx - gesture.cx, cy - gesture.cy)
    const { lu, lv } = limits(scale)
    u = rubber(gesture.u - d.x, -lu, lu)
    v = rubber(gesture.v - d.y, -lv, lv)
  }

  function onPointerUp(e: PointerEvent): void {
    if (!pointers.delete(e.pointerId)) return
    const out = (() => {
      const { lu, lv } = limits(scale)
      return Math.abs(u) > lu || Math.abs(v) > lv
    })()
    if (out) settle(clampOffset)
    startGesture()
  }

  // Коліщатко — через addEventListener: лише з { passive: false } можна
  // скасувати прокрутку сторінки під діалогом. Щипок на тачпаді браузер
  // присилає як wheel з ctrlKey — він чутливіший, тож крок більший.
  function wheelZoom(node: HTMLElement) {
    const onWheel = (e: WheelEvent) => {
      if (!natural.w) return
      e.preventDefault()
      const rect = node.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
      zoomAt(scale * factor, e.clientX - rect.left, e.clientY - rect.top)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return { destroy: () => node.removeEventListener('wheel', onWheel) }
  }

  // ─── Кути рамки ───

  type Corner = 'nw' | 'ne' | 'sw' | 'se'
  const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']
  let resize: { sx: 1 | -1; sy: 1 | -1; ax: number; ay: number } | null =
    null

  function onCornerDown(corner: Corner, e: PointerEvent): void {
    if (!natural.w || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    settling = false
    // Протилежний кут стоїть, рамка росте від нього в бік пальця.
    const sx = corner.endsWith('e') ? 1 : -1
    const sy = corner.startsWith('s') ? 1 : -1
    resize = {
      sx,
      sy,
      ax: sx > 0 ? PAD : PAD + crop,
      ay: sy > 0 ? PAD : PAD + crop,
    }
    frame = { x: PAD, y: PAD, size: crop }
  }

  function onCornerMove(e: PointerEvent): void {
    if (!resize) return
    const stage = (e.currentTarget as HTMLElement).closest('.stage')
    if (!(stage instanceof HTMLElement)) return
    const p = stagePoint(e, stage)
    const { sx, sy, ax, ay } = resize
    // Не дрібніше, ніж дозволяє найбільше наближення.
    const smallest = Math.max(MIN_FRAME, (crop * scale) / maxScale)
    const size = clamp(
      Math.max((p.x - ax) * sx, (p.y - ay) * sy),
      smallest,
      crop,
    )
    frame = {
      x: sx > 0 ? ax : ax - size,
      y: sy > 0 ? ay : ay - size,
      size,
    }
  }

  // Відпустили кут — виділене розтягується на всю рамку.
  function onCornerUp(): void {
    if (!resize || !frame) return
    resize = null
    const f = frame
    const k = crop / f.size
    const q = pointAt(f.x + f.size / 2, f.y + f.size / 2)
    settle(() => {
      frame = null
      if (k > 1.001) {
        place(q.x, q.y, clamp(scale * k, minScale, maxScale), center, center)
        chosenScale = scale
      }
    })
  }

  // ─── Лінійка нахилу ───

  let tiltDrag: { x: number; tilt: number } | null = null

  function onRulerDown(e: PointerEvent): void {
    if (!src) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    settling = false
    tiltDrag = { x: e.clientX, tilt }
  }

  function onRulerMove(e: PointerEvent): void {
    if (!tiltDrag) return
    // Тягнеш шкалу вліво — під покажчик приїжджають більші градуси.
    setTilt(tiltDrag.tilt - (e.clientX - tiltDrag.x) / PX_PER_DEG)
  }

  function onRulerKey(e: KeyboardEvent): void {
    const stepDeg = e.shiftKey ? 5 : 1
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setTilt(tilt - stepDeg)
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
      setTilt(tilt + stepDeg)
    else if (e.key === 'Home' || e.key === '0') settle(() => setTilt(0))
    else return
    e.preventDefault()
  }

  // ─── Клавіатура на фото ───

  function onStageKey(e: KeyboardEvent): void {
    if (!natural.w) return
    const move = e.shiftKey ? 40 : 10
    const shift = (dx: number, dy: number) =>
      settle(() => {
        const d = toImage(dx, dy)
        u -= d.x
        v -= d.y
        clampOffset()
      })

    switch (e.key) {
      case 'ArrowLeft':
        shift(-move, 0)
        break
      case 'ArrowRight':
        shift(move, 0)
        break
      case 'ArrowUp':
        shift(0, -move)
        break
      case 'ArrowDown':
        shift(0, move)
        break
      case '+':
      case '=':
        settle(() => zoomAt(scale * 1.25, center, center))
        break
      case '-':
        settle(() => zoomAt(scale / 1.25, center, center))
        break
      default:
        return
    }
    e.preventDefault()
  }

  // ─── Результат ───

  let exporting = $state(false)

  async function confirm(): Promise<void> {
    if (!image || !natural.w || exporting) return
    exporting = true
    // Якщо натиснули посеред пружини — беремо вже повернуте в межі.
    clampOffset()

    const out = Math.max(1, Math.min(OUTPUT_MAX, Math.round(crop / scale)))
    const canvas = document.createElement('canvas')
    canvas.width = out
    canvas.height = out
    const ctx = canvas.getContext('2d')

    let blob: Blob | null = null
    if (ctx) {
      // Прозорий PNG у JPEG став би чорним — підкладаємо біле.
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, out, out)
      ctx.imageSmoothingQuality = 'high'
      // Той самий перетвір, що й на сцені, лише від центру кола.
      const off = toStage(u, v)
      const w = natural.w * scale
      const h = natural.h * scale
      ctx.translate(out / 2, out / 2)
      ctx.scale(out / crop, out / crop)
      ctx.translate(-off.x, -off.y)
      ctx.rotate(rad)
      ctx.scale(flipped ? -1 : 1, 1)
      ctx.drawImage(image, -w / 2, -h / 2, w, h)
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9),
      )
    }

    exporting = false
    if (!blob) {
      failed = true
      return
    }
    file = null
    onConfirm(blob)
  }
</script>

<Dialog.Root
  open={file !== null}
  onOpenChange={(open) => {
    if (!open) file = null
  }}
>
  <!-- Редактор завжди темний, як у Telegram: фото на чорному читається
       краще, і світла тема застосунку тут лише заважала б. Клас dark
       перемикає токени лише всередині вікна.

       Фокус при відкритті — на саме вікно, а не на перший елемент: інакше
       ним ставала сцена, і фото відкривалось у рамці фокусу.

       Ширина обмежена й висотою екрана: сцена квадратна, і на низькому
       ноутбуці чи телефоні боком вікно інакше вилазило б за верх.
       14rem — шапка, лінійка й кнопки разом із відступами. -->
  <Dialog.Content
    bind:ref={dialogEl}
    showCloseButton={false}
    onOpenAutoFocus={(e) => {
      e.preventDefault()
      dialogEl?.focus()
    }}
    class="dark max-w-[min(calc(100%-2rem),calc(100svh-14rem))] gap-0 overflow-hidden bg-neutral-950 p-0 text-white ring-white/10 sm:max-w-[min(27.5rem,calc(100svh-14rem))]"
  >
    <Dialog.Header class="px-5 pt-4 pb-3">
      <Dialog.Title class="text-[15px] text-white">Фото профілю</Dialog.Title>
      <Dialog.Description class="text-[13px] text-white/55">
        Тягніть фото, кут рамки — щоб наблизити місце.
      </Dialog.Description>
    </Dialog.Header>

    <!-- Сцена. touch-none: жести забирає собі редактор, а не прокрутка
         сторінки. Фото малюється в розмірі показу (width/height), а не
         transform: scale — оригінал на 6000px інакше ставав би величезною
         текстурою, яку слабкий телефон не тягне. -->
    <!-- role="application" — саме для області з власними жестами й
         клавішами, але Svelte не зараховує її до інтерактивних ролей. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      bind:clientWidth={stageSize}
      use:wheelZoom
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      onkeydown={onStageKey}
      role="application"
      tabindex="0"
      aria-label="Фото. Стрілки — зсунути, плюс і мінус — масштаб"
      class="stage relative aspect-square w-full touch-none overflow-hidden bg-black outline-none select-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-inset"
      class:grabbing
    >
      {#if src}
        <img
          {src}
          alt=""
          draggable="false"
          class="pointer-events-none absolute top-0 left-0 max-w-none"
          class:settling
          style:width="{natural.w * scale}px"
          style:height="{natural.h * scale}px"
          style:transform="translate({imageCenter.x -
            (natural.w * scale) / 2}px, {imageCenter.y -
            (natural.h * scale) /
              2}px) rotate({angle}deg) scaleX({flipped ? -1 : 1})"
        />
      {:else if failed}
        <p
          class="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-white/80"
        >
          Не вдалося відкрити це зображення. Спробуйте JPG чи PNG.
        </p>
      {/if}

      {#if src}
        <!-- Рамка: затемнення поза колом (тінь самого кола), лінії третин,
             межа квадрата й точки на кутах. -->
        <div
          class="frame pointer-events-none absolute"
          class:settling
          style:left="{box.x}px"
          style:top="{box.y}px"
          style:width="{box.size}px"
          style:height="{box.size}px"
        >
          <div
            class="absolute inset-0 rounded-full"
            style:box-shadow="0 0 0 9999px rgb(0 0 0 / 0.62)"
          ></div>
          <div class="absolute inset-0 border border-white/45"></div>
          <div class="absolute inset-y-0 left-1/3 w-px bg-white/25"></div>
          <div class="absolute inset-y-0 left-2/3 w-px bg-white/25"></div>
          <div class="absolute inset-x-0 top-1/3 h-px bg-white/25"></div>
          <div class="absolute inset-x-0 top-2/3 h-px bg-white/25"></div>

          {#each CORNERS as corner (corner)}
            <span
              class="corner pointer-events-auto absolute flex size-8 items-center justify-center {corner}"
              onpointerdown={(e) => onCornerDown(corner, e)}
              onpointermove={onCornerMove}
              onpointerup={onCornerUp}
              onpointercancel={onCornerUp}
              aria-hidden="true"
            >
              <span class="size-2.5 rounded-full bg-white shadow"></span>
            </span>
          {/each}
        </div>
      {/if}
    </div>

    <!-- ─── Поворот · лінійка нахилу · дзеркало ─── -->
    <div class="flex items-center gap-1 px-2 pt-3">
      <button
        type="button"
        onclick={rotateLeft}
        disabled={!src}
        aria-label="Повернути на 90°"
        title="Повернути на 90°"
        class="tool"
      >
        <RotateCcwSquare size={22} strokeWidth={1.75} />
      </button>

      <!-- Шкала їде під нерухомою позначкою; поточний кут — великим над
           нею, сусідні підписи ховаються, щоб не налазити на нього.
           Подвійний клік — рівно. -->
      <div
        role="slider"
        tabindex="0"
        aria-label="Нахил"
        aria-valuemin={-TILT_MAX}
        aria-valuemax={TILT_MAX}
        aria-valuenow={Math.round(tilt)}
        aria-valuetext="{Math.round(tilt)}°"
        onpointerdown={onRulerDown}
        onpointermove={onRulerMove}
        onpointerup={() => (tiltDrag = null)}
        onpointercancel={() => (tiltDrag = null)}
        onkeydown={onRulerKey}
        ondblclick={() => settle(() => setTilt(0))}
        class="ruler relative h-14 min-w-0 flex-1 cursor-ew-resize touch-none overflow-hidden outline-none select-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-white/50"
        class:opacity-40={!src}
      >
        <div
          class="absolute inset-y-0 left-1/2"
          style:transform="translateX({-tilt * PX_PER_DEG}px)"
        >
          {#each LABELS as deg (deg)}
            <span
              class="absolute top-2 -translate-x-1/2 text-[11px] text-white/45 tabular-nums transition-opacity duration-150"
              style:left="{deg * PX_PER_DEG}px"
              style:opacity={Math.abs(deg - tilt) < 9 ? 0 : 1}
            >
              {deg}°
            </span>
          {/each}
          {#each TICKS as deg (deg)}
            <span
              class="absolute bottom-2 -translate-x-1/2 rounded-full {deg %
                15 ===
              0
                ? 'size-1 bg-white/70'
                : 'size-0.5 bg-white/35'}"
              style:left="{deg * PX_PER_DEG}px"
            ></span>
          {/each}
        </div>

        <span
          class="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 text-[15px] font-semibold tabular-nums"
        >
          {Math.round(tilt)}°
        </span>
        <span
          class="caret pointer-events-none absolute bottom-3.5 left-1/2 -translate-x-1/2"
          aria-hidden="true"
        ></span>
      </div>

      <button
        type="button"
        onclick={flip}
        disabled={!src}
        aria-label="Віддзеркалити"
        title="Віддзеркалити"
        class="tool"
      >
        <FlipHorizontal2 size={22} strokeWidth={1.75} />
      </button>
    </div>

    <div class="flex justify-end gap-2 px-4 pt-2 pb-4">
      <button
        type="button"
        onclick={() => (file = null)}
        class="h-8 cursor-pointer rounded-[8px] px-3 text-[14px] font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
      >
        Скасувати
      </button>
      <Button variant="primary" onclick={confirm} disabled={!src || exporting}>
        Готово
      </Button>
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  .stage {
    cursor: grab;
  }
  .stage.grabbing {
    cursor: grabbing;
  }

  .settling {
    transition:
      transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1),
      width 320ms cubic-bezier(0.2, 0.8, 0.2, 1),
      height 320ms cubic-bezier(0.2, 0.8, 0.2, 1),
      left 320ms cubic-bezier(0.2, 0.8, 0.2, 1),
      top 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  /* Точка — центр кута рамки; область натиску 32px, бо 10px пальцем не
     влучити. */
  .corner.nw {
    left: -16px;
    top: -16px;
    cursor: nwse-resize;
  }
  .corner.ne {
    right: -16px;
    top: -16px;
    cursor: nesw-resize;
  }
  .corner.sw {
    left: -16px;
    bottom: -16px;
    cursor: nesw-resize;
  }
  .corner.se {
    right: -16px;
    bottom: -16px;
    cursor: nwse-resize;
  }

  .tool {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 9999px;
    color: rgb(255 255 255 / 0.85);
    cursor: pointer;
    transition:
      background-color 150ms ease,
      color 150ms ease;
  }
  .tool:hover:not(:disabled) {
    background-color: rgb(255 255 255 / 0.1);
    color: #fff;
  }
  .tool:disabled {
    opacity: 0.4;
    cursor: default;
  }

  /* Краї шкали тануть — видно, що вона продовжується. */
  .ruler {
    mask-image: linear-gradient(
      to right,
      transparent,
      #000 22%,
      #000 78%,
      transparent
    );
  }

  .caret {
    width: 0;
    height: 0;
    border-inline: 4px solid transparent;
    border-bottom: 5px solid #fff;
  }

  @media (prefers-reduced-motion: reduce) {
    .settling {
      transition: none;
    }
  }
</style>
