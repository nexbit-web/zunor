<!--
  QR-код Zunor: біла плашка з рамкою поля вводу, модулі зі скругленими
  кутами (сусідні зливаються в «краплі»), заокруглені «очі» і знак Zunor
  у колі акценту посередині. Малюється з матриці (сервер віддає її рядком
  «0/1», див. admin/2fa).

  Що тримає код читабельним — не чіпати без перевірки сканером:
    — плашка завжди біла, модулі темні, в обох темах (інвертований
      QR читають далеко не всі застосунки);
    — тиха зона — падінг підкладки, не менше 4 модулів;
    — під знак вирізано коло ~4% площі; корекція на сервері — Q (25%).
-->
<script lang="ts">
  import { ZunorMark } from '$lib/components/icons'

  let {
    size,
    cells,
    label,
    class: className = '',
  }: { size: number; cells: string; label: string; class?: string } = $props()

  const R = 0.5 // радіус вільного кута: самотній модуль — коло, ряд — капсула

  const c = $derived(size / 2)
  const holeR = $derived(size * 0.115)

  function inFinder(x: number, y: number): boolean {
    return (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7)
  }

  function inHole(x: number, y: number): boolean {
    return Math.hypot(x + 0.5 - c, y + 0.5 - c) < holeR
  }

  /** Модуль, що малюється точкою (не «око», не під знаком). */
  function dark(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= size || y >= size) return false
    return cells[y * size + x] === '1' && !inFinder(x, y) && !inHole(x, y)
  }

  // Усе — одним path: так спільні ребра сусідніх модулів не дають
  // волосяних щілин від згладжування, як було б з окремими фігурами.
  const modules = $derived.by(() => {
    let d = ''
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!dark(x, y)) continue
        const up = dark(x, y - 1)
        const down = dark(x, y + 1)
        const left = dark(x - 1, y)
        const right = dark(x + 1, y)
        // Кут скруглюється, коли обидві сторони біля нього вільні.
        const tl = !up && !left ? R : 0
        const tr = !up && !right ? R : 0
        const br = !down && !right ? R : 0
        const bl = !down && !left ? R : 0
        d +=
          `M${x + tl} ${y}H${x + 1 - tr}` +
          (tr ? `a${tr} ${tr} 0 0 1 ${tr} ${tr}` : '') +
          `V${y + 1 - br}` +
          (br ? `a${br} ${br} 0 0 1 ${-br} ${br}` : '') +
          `H${x + bl}` +
          (bl ? `a${bl} ${bl} 0 0 1 ${-bl} ${-bl}` : '') +
          `V${y + tl}` +
          (tl ? `a${tl} ${tl} 0 0 1 ${tl} ${-tl}` : '') +
          'Z'
      }
    }
    return d
  })

  const finders = $derived([
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ])

  // Коло знака — трохи менше вирізу, щоб довкола лишалось повітря.
  const logoPct = $derived(((holeR * 2 - 1.4) / size) * 100)
</script>

<div class="qr-plate {className}">
  <div class="relative">
    <svg viewBox="0 0 {size} {size}" class="block size-full" role="img" aria-label={label}>
      <path d={modules} fill="var(--qr-ink)" />
      {#each finders as [fx, fy] (`${fx}-${fy}`)}
        <rect
          x={fx + 0.5}
          y={fy + 0.5}
          width="6"
          height="6"
          rx="2"
          fill="none"
          stroke="var(--qr-ink)"
          stroke-width="1"
        />
        <rect x={fx + 2} y={fy + 2} width="3" height="3" rx="1" fill="var(--qr-ink)" />
      {/each}
    </svg>

    <span
      class="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground"
      style:width="{logoPct}%"
      style:height="{logoPct}%"
      aria-hidden="true"
    >
      <ZunorMark class="h-[52%] w-auto" />
    </span>
  </div>
</div>

<style>
  .qr-plate {
    --qr-ink: #1f1f1f;
    /* Біла в обох темах: на темній підкладці модулі втратили б контраст.
       Рамка — та сама, що в полів вводу. */
    background: #fff;
    border: 1px solid var(--input);
    border-radius: 16px;
    /* Тиха зона: ≥ 4 модулі при розмірі коду ~190px (49 модулів). */
    padding: 18px;
  }
</style>
