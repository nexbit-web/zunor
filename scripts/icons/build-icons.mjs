// Збирає набір іконок src/lib/components/icons/set/*.svelte з контурів
// Hugeicons (стиль Stroke Rounded, MIT). Пакет у залежностях не
// тримаємо — іконок у нас сотня, а в ньому тисячі:
//
//   npm pack @hugeicons/core-free-icons
//   tar xzf hugeicons-core-free-icons-*.tgz        # → ./package
//   node scripts/icons/build-icons.mjs ./package
//
// Нова іконка — рядок у ICONS (імʼя файлу → імʼя в Hugeicons без «Icon»),
// потім перезапуск. Шукати відповідник: https://hugeicons.com/icons
// (фільтр Free, Stroke Rounded). Файли в set/ руками не правити — їх
// перезапише наступний запуск, а зайві (яких немає в ICONS) видаляються.
//
// Імена файлів — як у lucide, з якого переїхали: так місце виклику
// читається так само, як читалося.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

/**
 * Власні контури — коли готової іконки немає. Галочка «замовлення»:
 * корпус і затискач з Task01, галочка — Tick01, зменшена всередину.
 */
const CUSTOM = {
  'clipboard-check': [
    'M14.4961 2.00027H9.49609C8.66767 2.00027 7.99609 2.67185 7.99609 3.50027C7.99609 4.3287 8.66767 5.00027 9.49609 5.00027H14.4961C15.3245 5.00027 15.9961 4.3287 15.9961 3.50027C15.9961 2.67185 15.3245 2.00027 14.4961 2.00027Z',
    'M15.9961 3.50027C17.5496 3.54709 18.4761 3.72035 19.1174 4.36164C19.9961 5.24032 19.9961 6.65451 19.9961 9.4829L19.9961 15.9997C19.9961 18.8282 19.9961 20.2424 19.1174 21.1211C18.2387 21.9997 16.8245 21.9997 13.9961 21.9997L9.99609 21.9997C7.16767 21.9997 5.75346 21.9997 4.87478 21.1211C3.9961 20.2424 3.9961 18.8282 3.99609 15.9998L3.99611 9.48296C3.9961 6.65453 3.9961 5.24031 4.87478 4.36163C5.51606 3.72034 6.44261 3.54708 7.99599 3.50027',
    'M8.15 15.1C8.15 15.1 8.98 15.1 10.08 17.03C10.08 17.03 13.13 11.98 15.85 10.98',
  ],
}

/**
 * Імʼя файлу → іконка Hugeicons. Рядок — імʼя в Hugeicons; масив —
 * власні контури; `{ from, viewBox }` — іконка з оптичним зсувом.
 */
const ICONS = {
  analytics: 'Analytics01',
  'app-window': 'WindowsOld',
  'arrow-down': 'ArrowDown02',
  'arrow-left': 'ArrowLeft02',
  'arrow-left-right': 'ArrowDataTransferHorizontal',
  'arrow-right': 'ArrowRight02',
  'arrow-up': 'ArrowUp02',
  'arrow-up-down': 'ArrowDataTransferVertical',
  'at-sign': 'At',
  'badge-check': 'CheckmarkBadge01',
  bell: 'Notification01',
  'bell-off': 'NotificationOff01',
  'bell-ring': 'BellRing',
  boxes: 'Package',
  briefcase: 'Briefcase01',
  'brush-cleaning': 'Clean',
  building: 'Building02',
  'building-2': 'Building03',
  bus: 'Bus01',
  calendar: 'Calendar03',
  'calendar-clock': 'CalendarClock',
  'calendar-days': 'Calendar03',
  'calendar-x': 'CalendarRemove01',
  camera: 'Camera01',
  'camera-add': 'CameraAdd01',
  car: 'Car01',
  check: 'Tick02',
  'check-check': 'TickDouble02',
  'chevron-down': 'ArrowDown01',
  'chevron-left': 'ArrowLeft01',
  'chevron-right': 'ArrowRight01',
  'chevron-up': 'ArrowUp01',
  'chevrons-up-down': 'UnfoldMore',
  circle: 'Circle',
  'circle-alert': 'AlertCircle',
  'circle-check': 'CheckmarkCircle02',
  'circle-user-round': 'UserCircle',
  'clipboard-check': CUSTOM['clipboard-check'],
  'clipboard-list': 'Task01',
  clock: 'Clock01',
  'cloud-upload': 'CloudUpload',
  'columns-2': 'LayoutTwoColumn',
  copy: 'Copy01',
  'door-open': 'Door01',
  download: 'Download01',
  ellipsis: 'MoreHorizontal',
  eye: 'View',
  'eye-off': 'ViewOffSlash',
  'file-text': 'File02',
  files: 'Files02',
  flame: 'Fire',
  'flip-horizontal-2': 'FlipHorizontal',
  'glass-water': 'GlassWater',
  'graduation-cap': 'Mortarboard01',
  hammer: 'Hammer01',
  handshake: 'Agreement02',
  house: 'Home01',
  'id-card': 'IdentityCard',
  image: 'Image01',
  'image-plus': 'ImageAdd01',
  'image-up': 'ImageUpload01',
  images: 'Album01',
  inbox: 'Inbox',
  info: 'InformationCircle',
  'layout-dashboard': 'DashboardSquare02',
  'layout-grid': 'DashboardSquare01',
  link: 'Link01',
  'more-vertical': 'MoreVertical',
  'loader-circle': 'Loading03',
  lock: 'SquareLock02',
  'log-out': 'Logout03',
  'map-pin': 'Location01',
  menu: 'Menu01',
  'message-circle': 'Message01',
  'message-square': 'Comment01',
  'message-square-text': 'Chat01',
  mic: 'Mic01',
  minus: 'MinusSign',
  palette: 'PaintBoard',
  'panel-left': 'SidebarLeft',
  paperclip: 'Attachment02',
  pencil: 'PencilEdit01',
  phone: 'Call02',
  play: 'Play',
  plus: 'PlusSign',
  printer: 'Printer',
  'refresh-cw': 'Reload',
  repeat: 'Repeat',
  reply: 'Reply',
  'rotate-ccw': 'Undo',
  'rotate-ccw-square': 'RotateCcwSquare',
  ruler: 'Ruler',
  search: 'Search01',
  // Стрілка «надіслати» — з лінією-згином посередині, як у референсі.
  // Центр мас трикутника — праворуч угорі від центру сітки (≈ +0.9, −1),
  // і в круглій кнопці стрілка здавалась зсунутою. viewBox зміщує її
  // оптично в центр — одразу в усіх кнопках.
  send: { from: 'Sent', viewBox: '0.9 -1 24 24' },
  settings: 'Settings01',
  'settings-2': 'FilterHorizontal',
  shield: 'Shield01',
  'shield-check': 'SecurityCheck',
  smile: 'Smile',
  'smile-plus': 'SmilePlus',
  sofa: 'Sofa01',
  sparkle: 'Sparkle',
  sparkles: 'Sparkles',
  square: 'Square',
  'square-pen': 'PencilEdit02',
  star: 'Star',
  store: 'Store01',
  tag: 'Tag01',
  timer: 'Timer02',
  'trash-2': 'Delete02',
  'trending-up': 'ChartLineData01',
  user: 'User',
  'user-plus': 'UserAdd01',
  'user-round': 'User',
  'user-round-search': 'UserSearch01',
  users: 'UserMultiple',
  wallet: 'Wallet01',
  'volume-2': 'VolumeHigh',
  'volume-x': 'VolumeMute02',
  'waving-hand': 'WavingHand02',
  x: 'Cancel01',
}

// Атрибути, які задає основа (stroke-icon.svelte): лінія кольору тексту,
// товщина з пропа, круглі кінці. Решту (fill, fill-rule, opacity…)
// переносимо як є.
const BASE = {
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

const kebab = (k) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())

function element([tag, attrs]) {
  const out = []
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'key') continue
    if (k === 'strokeWidth' && v !== BASE.strokeWidth) {
      throw new Error(`товщина ${v} замість 1.5 — така іконка не масштабується пропом`)
    }
    if (BASE[k] === v) continue
    out.push(`${kebab(k)}="${v}"`)
  }
  // Залитий елемент без власного stroke успадкував би лінію від svg і
  // став би жирнішим за оригінал.
  if (!('stroke' in attrs)) out.push('stroke="none"')
  const line = `  <${tag} ${out.join(' ')} />`
  if (line.length <= 80) return line
  return `  <${tag}\n${out.map((a) => `    ${a}`).join('\n')}\n  />`
}

async function main() {
  const pkg = process.argv[2]
  if (!pkg) throw new Error('вкажи теку розпакованого пакета: node build-icons.mjs ./package')
  const esm = path.resolve(pkg, 'dist/esm')
  const here = path.dirname(fileURLToPath(import.meta.url))
  const out = path.resolve(here, '../../src/lib/components/icons/set')
  fs.mkdirSync(out, { recursive: true })

  for (const [name, entry] of Object.entries(ICONS)) {
    let body
    let origin
    const source = typeof entry === 'object' && !Array.isArray(entry) ? entry.from : entry
    const viewBox = entry.viewBox ?? null
    if (Array.isArray(source)) {
      body = source.map((d) => element(['path', { d, stroke: 'currentColor' }]))
      origin = 'Власні контури за мотивами Hugeicons'
    } else {
      const mod = await import(pathToFileURL(path.join(esm, `${source}Icon.js`)).href)
      body = mod.default.map(element)
      origin = `Hugeicons ${source}${viewBox ? ', оптично відцентрована' : ''}`
    }

    fs.writeFileSync(
      path.join(out, `${name}.svelte`),
      `<script lang="ts">
  // ${origin}. Згенеровано scripts/icons/build-icons.mjs — не правити.
  import StrokeIcon, { type IconProps } from '../stroke-icon.svelte'

  let { size = 24, ...rest }: IconProps = $props()
</script>

<StrokeIcon {size}${viewBox ? ` viewBox="${viewBox}"` : ''} {...rest}>
${body.join('\n')}
</StrokeIcon>
`,
    )
  }

  // Зайві файли — іконки, які прибрали з ICONS.
  for (const file of fs.readdirSync(out)) {
    if (!(file.replace(/\.svelte$/, '') in ICONS)) fs.rmSync(path.join(out, file))
  }

  console.log(`set/: ${Object.keys(ICONS).length} іконок`)
}

await main()
