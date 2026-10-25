// Розклад хвиль. Номер хвилі й ліміт виводяться з віку заявки, тож
// будь-хто — таймер, відновлення після рестарту, крон — порахує те саме.

import { DISPATCH_CONFIG } from '../config'

const { WAVES } = DISPATCH_CONFIG
const MINUTE = 60_000

/** Номер останньої хвилі — тієї, що кличе все місто. */
export const FINAL_WAVE = WAVES.length

/** Через скільки хвилин розсилка доходить до всього міста. */
export const WAVES_DONE_MIN = WAVES[FINAL_WAVE - 1].afterMinutes

export function ageMinutes(createdAt: Date, now: Date): number {
  return (now.getTime() - createdAt.getTime()) / MINUTE
}

/** Номер хвилі (з 1) для заявки такого віку. */
export function waveAt(ageMinutes: number): number {
  return Math.max(1, WAVES.filter((w) => ageMinutes >= w.afterMinutes).length)
}

/** Коли настає хвиля `wave` заявки, створеної в `createdAt`. */
export function waveStartsAt(createdAt: Date, wave: number): Date {
  const { afterMinutes } = WAVES[Math.min(Math.max(wave, 1), FINAL_WAVE) - 1]
  return new Date(createdAt.getTime() + afterMinutes * MINUTE)
}

/** Скільки майстрів сумарно можна покликати до хвилі `wave` включно. */
export function waveQuota(wave: number): number {
  return WAVES.slice(0, wave).reduce((sum, w) => sum + w.batchSize, 0)
}
