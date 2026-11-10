// Тексти лендингу, які потрібні кільком місцям одразу: шапці (меню
// «Послуги»), першому екрану й розділу послуг. Самі послуги й назви — з
// контенту категорії (presets.ts), тут лише опис для людини, що ще не
// замовляла.

import { SERVICES } from '$lib/categories/cleaning/presets'

/** Куди веде «Замовити прибирання» гостя: спершу акаунт. */
export const ORDER_HREF = '/user/register'
/** Те саме для того, хто вже увійшов: одразу розмова з асистентом. */
export const ORDER_HREF_SIGNED_IN = '/dashboard/jobs/new'

const BLURB: Record<string, string> = {
  standard: 'Пил, підлога, кухня й санвузол — щоб удома знову легко дихалось.',
  deep: 'Усе й усюди: шафи всередині, духовка, плитка, двері, батареї.',
  'post-renovation':
    'Будівельний пил, затірка, фарба на склі — і вивіз сміття, якщо треба.',
  windows: 'Склопакети, рами й підвіконня — зсередини чи з обох боків.',
  sofa: 'Дивани, крісла, матраци й килими — просто в тебе вдома.',
  regular: 'Квартира чи офіс за графіком: щотижня, раз на два тижні, щомісяця.',
}

/** Один рядок під назвою в меню «Послуги» — як підпис у меню ClickUp. */
const SHORT: Record<string, string> = {
  standard: 'Пил, підлога, кухня й санвузол',
  deep: 'Усе й усюди, до кожної шафки',
  'post-renovation': 'Пил, затірка й вивіз сміття',
  windows: 'Склопакети, рами, підвіконня',
  sofa: 'Дивани, матраци й килими вдома',
  regular: 'Квартира чи офіс за графіком',
}

/** Колір іконки під курсором: у спокої вона чорна, як у ClickUp. */
const TINT: Record<string, string> = {
  standard: '#0091ff',
  deep: '#6647f0',
  'post-renovation': '#f76808',
  windows: '#06b6d4',
  sofa: '#e93d82',
  regular: '#16a34a',
}

export const LANDING_SERVICES = SERVICES.map((s) => ({
  key: s.key,
  label: s.label,
  blurb: BLURB[s.key] ?? '',
  short: SHORT[s.key] ?? '',
  tint: TINT[s.key] ?? 'var(--primary)',
}))
