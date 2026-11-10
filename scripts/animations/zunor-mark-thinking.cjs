// Генератор static/animations/zunor-mark-thinking.json — анімації «Zunor
// думає» в чаті. Запуск із кореня проєкту:
//
//   node scripts/animations/zunor-mark-thinking.cjs
//
// Контури знака беруться з zunor-mark-blink.json, тож форма завжди та сама,
// що й у решти анімацій. Сценки — у SCENES нижче: міняй пози там і
// перезапускай, руками JSON не правиться.
//
// Кілька сценок «думає», кожна — маркер.
// Кожна починається й закінчується нейтральною позою, тож компонент
// склеює їх у будь-якому порядку без ривка.
//
// Очі — окремі фігури кольору rgb(0,0,0): lottie-mono малює їх кольором
// фону, тож вони читаються як прорізи. Так очі рухаються трансформацією
// групи, а не ключами контуру, — файл у рази менший.
const fs = require('fs')
const path = require('path')
const DIR = path.join(__dirname, '../../static/animations')
const src = path.join(DIR, 'zunor-mark-blink.json')
const out = path.join(DIR, 'zunor-mark-thinking.json')
const blink = JSON.parse(fs.readFileSync(src, 'utf8'))
const group = blink.layers[0].shapes[0]
const bodyShape = group.it.find((s) => s.nm === 'body')
const eyeShapes = ['eye_right', 'eye_left'].map((nm) =>
  group.it.find((s) => s.nm === nm),
)
const openEye = (e) => e.ks.k[0].s[0]

const FR = 60
const PAD = { left: 34, right: 34, top: 70, bottom: 8 }
const W = 393 + PAD.left + PAD.right
const H = 411 + PAD.top + PAD.bottom
const PIVOT = [196.5, 400] // низ знака: присідання й нахил — від «підлоги»
const r2 = (n) => Math.round(n * 100) / 100

const EASES = {
  smooth: { o: { x: 0.33, y: 0 }, i: { x: 0.67, y: 1 } },
  snap: { o: { x: 0.5, y: 0 }, i: { x: 0.1, y: 1 } }, // сакада: різко рушає, мʼяко стає
  out: { o: { x: 0.2, y: 0.6 }, i: { x: 0.35, y: 1 } }, // відскок
}

const NEUTRAL = {
  dx: 0,
  dy: 0,
  sq: 1,
  grow: 1,
  x: 0,
  y: 0,
  r: 0,
  sx: 100,
  sy: 100,
}

// Сценки: [кадр від початку сценки, зміни пози, easing приходу в позу].
const SCENES = [
  {
    name: 'ponder',
    len: 150,
    poses: [
      [20, { dx: -10, dy: -24, sq: 0.86, r: -3 }],
      [70, {}],
      [90, { dx: 12, dy: -22, r: 2.5 }],
      [112, {}],
      [117, { sq: 0.06 }, 'snap'],
      [121, {}],
      [126, { sq: 0.86 }, 'snap'],
    ],
  },
  {
    name: 'scan',
    len: 110,
    poses: [
      [10, { dx: -13, dy: 4, r: -1.5 }, 'snap'],
      [28, {}],
      [36, { dx: 13, r: 1.5 }, 'snap'],
      [52, {}],
      [60, { dx: -13, r: -1.5 }, 'snap'],
      [76, {}],
      [84, { dx: 13, r: 1.5 }, 'snap'],
      [96, {}],
    ],
  },
  {
    name: 'eureka',
    len: 90,
    poses: [
      [12, { sx: 108, sy: 90, sq: 0.7 }],
      [22, { sx: 94, sy: 108, y: -34, sq: 1, grow: 1.12 }, 'snap'],
      [32, { sx: 100, sy: 102, y: -40 }],
      [44, { sx: 110, sy: 88, y: 0, grow: 1.05 }],
      [54, { sx: 97, sy: 104 }, 'out'],
      [64, { sx: 100, sy: 100, grow: 1 }],
    ],
  },
  {
    name: 'focus',
    len: 120,
    poses: [
      [30, { sq: 0.35, dy: 7, sy: 97 }],
      [70, {}],
      [74, { sq: 0.05 }, 'snap'],
      [80, {}],
      [86, { sq: 1, dy: -4, grow: 1.14, sy: 103 }, 'snap'],
      [98, { sy: 100 }],
    ],
  },
  {
    name: 'hmm',
    len: 90,
    poses: [
      [10, { sq: 0.8, dy: -6 }],
      [22, { r: -5 }],
      [36, { r: 5 }],
      [50, { r: -4 }],
      [62, { r: 0 }],
    ],
  },
]

// ── Розгортання сценок у суцільну шкалу кадрів ──
const timeline = [] // { t, pose, ease }
const markers = []
let start = 0
for (const scene of SCENES) {
  markers.push({ cm: scene.name, tm: start, dr: scene.len })
  let pose = { ...NEUTRAL }
  timeline.push({ t: start, pose })
  for (const [at, change, ease] of scene.poses) {
    pose = { ...pose, ...change }
    timeline.push({ t: start + at, pose, ease })
  }
  timeline.push({ t: start + scene.len, pose: { ...NEUTRAL }, ease: 'smooth' })
  start += scene.len
}
const OP = start

// Ключі однієї властивості: easing ключа k — це easing ПРИХОДУ в k+1.
function track(get, dims = 1) {
  const raw = timeline.map(({ t, pose, ease }) => ({
    t,
    v: get(pose),
    ease: ease ?? 'smooth',
  }))
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  // Посередині утримання ключ зайвий: він дорівнює і сусіду ліворуч, і праворуч.
  const keep = raw.filter(
    (k, i) =>
      i === 0 ||
      i === raw.length - 1 ||
      !(same(k.v, raw[i - 1].v) && same(k.v, raw[i + 1].v)),
  )
  // Два ключі на одному кадрі (кінець сценки = початок наступної) — лишаємо один.
  const uniq = keep.filter(
    (k, i) => i === keep.length - 1 || k.t !== keep[i + 1].t,
  )
  if (uniq.every((k) => same(k.v, uniq[0].v))) return { a: 0, k: uniq[0].v }
  return {
    a: 1,
    k: uniq.map((k, i) => {
      const s = Array.isArray(k.v) ? k.v : [k.v]
      if (i === uniq.length - 1) return { t: k.t, s }
      const e = EASES[uniq[i + 1].ease]
      const fill = (n) => Array(dims).fill(n)
      return {
        t: k.t,
        s,
        o: { x: fill(e.o.x), y: fill(e.o.y) },
        i: { x: fill(e.i.x), y: fill(e.i.y) },
      }
    }),
  }
}

const tr = (p, a, s, r) => ({
  ty: 'tr',
  p,
  a,
  s,
  r,
  o: { a: 0, k: 100 },
  sk: { a: 0, k: 0 },
  sa: { a: 0, k: 0 },
})
const fill = (rgb) => ({
  ty: 'fl',
  c: { a: 0, k: [...rgb, 1] },
  o: { a: 0, k: 100 },
  r: 1,
})

function eyeGroup(shape, nm) {
  const xs = shape.v.map((v) => v[0])
  const ys = shape.v.map((v) => v[1])
  const c = [
    r2((Math.min(...xs) + Math.max(...xs)) / 2),
    r2((Math.min(...ys) + Math.max(...ys)) / 2),
  ]
  return {
    ty: 'gr',
    nm,
    it: [
      { ty: 'sh', nm: 'contour', ks: { a: 0, k: shape } },
      fill([0, 0, 0]),
      tr(
        track((p) => [r2(c[0] + p.dx), r2(c[1] + p.dy)], 2),
        { a: 0, k: c },
        track((p) => [r2(100 * p.grow), r2(100 * p.grow * p.sq)], 2),
        { a: 0, k: 0 },
      ),
    ],
  }
}

const head = {
  ty: 'gr',
  nm: 'head',
  it: [
    // Перший у списку малюється згори: очі — над тілом.
    eyeGroup(openEye(eyeShapes[0]), 'eye_right'),
    eyeGroup(openEye(eyeShapes[1]), 'eye_left'),
    {
      ty: 'gr',
      nm: 'body',
      it: [
        { ty: 'sh', nm: 'contour', ks: bodyShape.ks },
        fill([1, 1, 1]),
        tr(
          { a: 0, k: [0, 0] },
          { a: 0, k: [0, 0] },
          { a: 0, k: [100, 100] },
          { a: 0, k: 0 },
        ),
      ],
    },
    tr(
      track((p) => [r2(PIVOT[0] + p.x), r2(PIVOT[1] + p.y)], 2),
      { a: 0, k: PIVOT },
      track((p) => [p.sx, p.sy], 2),
      track((p) => p.r),
    ),
  ],
}

const anim = {
  v: '5.7.0',
  fr: FR,
  ip: 0,
  op: OP,
  w: W,
  h: H,
  nm: 'zunor-mark-thinking',
  ddd: 0,
  assets: [],
  markers,
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'zunor',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [PAD.left, PAD.top, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ao: 0,
      shapes: [head],
      ip: 0,
      op: OP,
      st: 0,
      bm: 0,
    },
  ],
}

fs.writeFileSync(out, JSON.stringify(anim))
console.log('canvas', W, H, 'frames', OP, 'bytes', fs.statSync(out).size)
console.log('markers', markers.map((m) => `${m.cm}@${m.tm}+${m.dr}`).join(' '))
