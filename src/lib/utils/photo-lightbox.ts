// Повноекранний перегляд фото (PhotoSwipe) — один на весь застосунок:
// чат, портфоліо в налаштуваннях, галерея профілю й заявки. Вигляд — як
// у Telegram Desktop (photo-lightbox.css): темне тло, ряд іконок угорі
// праворуч, гортання стрілками, свайпом і клавішами.
//
// Посилання-мініатюри позначаються `data-pswp` (href — повне фото).
// Розміри знімка беремо з уже завантаженої мініатюри: PhotoSwipe малює
// фото рівно в тих розмірах, які йому дали, і з вигаданими 1600×1600
// кожен знімок розтягувався в квадрат.
//
// Без JS посилання лишається посиланням — фото відкривається вкладкою.

import PhotoSwipeLightbox from 'photoswipe/lightbox'
import 'photoswipe/style.css'
import './photo-lightbox.css'

/**
 * Ті самі іконки, що й у решті застосунку (Hugeicons Stroke Rounded, див.
 * icons/stroke-icon.svelte): PhotoSwipe чекає рядок розмітки, а не
 * компонент, тож контури продубльовані тут.
 */
function icon(body: string, cls = ''): string {
  return `<svg class="pswp__icn ${cls}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
}

const CLOSE = icon('<path d="M19 5 5 19M5 5l14 14"/>')
// Вертикальна риска плюса має клас PhotoSwipe — наближене фото ховає її,
// і «+» стає «−».
const ZOOM = icon(
  '<circle cx="11" cy="11" r="8"/><path d="M17 17l4 4M8 11h6"/><path class="pswp__zoom-icn-bar-v" d="M11 8v6"/>',
)
// Стрілку «далі» PhotoSwipe сам віддзеркалює з «назад».
const ARROW = icon(
  '<path d="M15 6C15 6 9 10.4189 9 12C9 13.5812 15 18 15 18"/>',
)
const DOWNLOAD = icon(
  '<path d="M3 17C3 17.93 3 18.395 3.102 18.777C3.379 19.812 4.188 20.621 5.223 20.898C5.605 21 6.07 21 7 21H17C17.93 21 18.395 21 18.776 20.898C19.811 20.621 20.62 19.812 20.898 18.777C21 18.395 21 17.93 21 17"/><path d="M16.5 11.5C16.5 11.5 13.186 16 12 16C10.814 16 7.5 11.5 7.5 11.5M12 15V3"/>',
)
const TRASH = icon(
  '<path d="M18.852 16.374L19.5 6H4.5L5.148 16.374C5.315 19.04 5.398 20.373 6.264 21.187C7.13 22 8.466 22 11.137 22H12.863C15.534 22 16.87 22 17.736 21.187C18.602 20.373 18.685 19.04 18.852 16.374Z"/><path d="M16 6H21M16 6L15.378 4.341C15.001 3.335 14.812 2.832 14.44 2.503C14.321 2.398 14.19 2.307 14.05 2.233C13.611 2 13.074 2 12 2C10.926 2 10.389 2 9.95 2.233C9.81 2.307 9.679 2.398 9.56 2.503C9.188 2.832 8.999 3.335 8.622 4.341L8 6M16 6H8M3 6H8"/><path d="M9.5 11V17M14.5 11V17"/>',
)

/**
 * Посилання на завантаження. Атрибут download на чужому домені браузер
 * ігнорує й просто відкриває фото, тож для Cloudinary просимо віддати
 * файл «вкладенням» (fl_attachment).
 */
function downloadUrl(src: string): string {
  return src.startsWith('https://res.cloudinary.com/')
    ? src.replace('/upload/', '/upload/fl_attachment/')
    : src
}

/** Відкритий перегляд, як його бачить той, хто видаляє фото. */
export interface PhotoViewer {
  close: () => void
  /**
   * Поки поверх перегляду відкрите підтвердження — перегляд не чує
   * клавіш: інакше Esc закривав би і питання, і перегляд, а стрілки
   * гортали б фото під ним.
   */
  hold: (on: boolean) => void
}

interface Options {
  children?: string
  /**
   * Своє фото можна видалити — у шапці зʼявляється кошик. Отримує номер
   * фото серед `children` і сам перегляд.
   */
  onDelete?: (index: number, viewer: PhotoViewer) => void
}

/**
 * Підключити перегляд до контейнера. Дочірні `a[data-pswp]` шукаються в
 * момент кліку, тож фото, додані пізніше, теж відкриваються. Повертає
 * функцію відключення — для `onMount`/`$effect`.
 */
export function photoLightbox(
  gallery: HTMLElement,
  { children = 'a[data-pswp]', onDelete }: Options = {},
): () => void {
  const lightbox = new PhotoSwipeLightbox({
    gallery,
    children,
    pswpModule: () => import('photoswipe'),
    mainClass: 'app-pswp',
    bgOpacity: 0.88,
    // Із видаленням поверх відкривається діалог підтвердження, а пастка
    // фокуса PhotoSwipe відбирала б у нього фокус.
    trapFocus: !onDelete,
    closeSVG: CLOSE,
    zoomSVG: ZOOM,
    arrowPrevSVG: ARROW,
    arrowNextSVG: ARROW,
    closeTitle: 'Закрити',
    zoomTitle: 'Збільшити',
    arrowPrevTitle: 'Попереднє',
    arrowNextTitle: 'Наступне',
    errorMsg: 'Не вдалося завантажити фото',
    indexIndicatorSep: ' з ',
  })

  lightbox.addFilter('domItemData', (data, _el, link) => {
    const img = link.querySelector('img')
    if (img?.naturalWidth) {
      data.w = img.naturalWidth
      data.h = img.naturalHeight
    }
    data.src = link.href
    data.msrc = img?.currentSrc
    // Мініатюра обрізана object-cover (квадрат у сітці) — PhotoSwipe
    // тоді відкриває фото з обрізаного прямокутника, а не стискає його.
    if (link.dataset.cropped !== undefined) data.thumbCropped = true
    return data
  })

  let held = false
  lightbox.on('keydown', (e) => {
    if (held) e.preventDefault()
  })

  // Кнопки шапки в порядку Telegram: видалити, завантажити, далі
  // штатні «наблизити» (order 10) і «закрити» (20).
  lightbox.on('uiRegister', () => {
    const ui = lightbox.pswp?.ui
    if (!ui) return

    if (onDelete) {
      ui.registerElement({
        name: 'delete',
        order: 8,
        isButton: true,
        title: 'Видалити',
        html: TRASH,
        onClick: (_e, _el, pswp) =>
          onDelete(pswp.currIndex, {
            close: () => {
              held = false
              pswp.close()
            },
            hold: (on) => (held = on),
          }),
      })
    }

    ui.registerElement({
      name: 'download',
      order: 9,
      isButton: true,
      tagName: 'a',
      title: 'Завантажити',
      html: DOWNLOAD,
      onInit: (el, pswp) => {
        const link = el as HTMLAnchorElement
        link.setAttribute('download', '')
        link.rel = 'noopener'
        const sync = () => {
          const src = pswp.currSlide?.data.src
          if (src) link.href = downloadUrl(src)
        }
        pswp.on('change', sync)
        sync()
      },
    })
  })

  lightbox.on('destroy', () => (held = false))

  lightbox.init()
  return () => lightbox.destroy()
}
