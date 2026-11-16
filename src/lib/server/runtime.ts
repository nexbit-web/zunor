// * де живе сервер: Hostinger — один довгоживучий процес, стан у памʼяті
// * працює; Vercel — функції, там стан у Redis, хвилі в QStash, періодика в кроні

import { env } from '$env/dynamic/private'

/** Vercel виставляє VERCEL=1 і на збірці, і в рантаймі функцій. */
export const serverless = env.VERCEL === '1'

/** Бойовий деплой, а не прев'ю гілки на Vercel. */
export const productionDeploy = !serverless || env.VERCEL_ENV === 'production'
