import { browser } from '$app/environment'

/**
 * Звукові сповіщення для чату через Web Audio API.
 *
 * НЕ використовуємо <audio> теги бо:
 *  • потрібно завантажувати mp3-файл (зайва мережа)
 *  • iOS Safari блокує autoplay
 *  • складно контролювати гучність і частоту
 *
 * Web Audio API синтезує звук на льоту, працює всюди, не потребує файлів.
 * Стиль звуку — короткий високий «дзень» як у Telegram/iOS.
 */

let audioContext: AudioContext | null = null
let muted = false

function getCtx(): AudioContext | null {
  if (!browser) return null
  if (!audioContext) {
    try {
      audioContext = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )()
    } catch {
      return null
    }
  }
  return audioContext
}

/**
 * Браузерна політика autoplay: AudioContext "висить" у стані suspended
 * поки юзер не зробить взаємодію (клік, тап). Викликати цю функцію
 * при першому клікові, щоб «розблокувати» звук.
 */
export function unlockAudio() {
  const ctx = getCtx()
  if (ctx?.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
}

/**
 * Грає звук «нове повідомлення».
 * Два швидких підйоми — як на iMessage / Telegram.
 */
export function playMessageSound() {
  if (muted) return
  const ctx = getCtx()
  if (!ctx) return

  // Якщо контекст ще suspended — спроба разблокувати
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
    return
  }

  const now = ctx.currentTime

  // Перший «дзень» (вищий)
  playBeep(ctx, 880, now, 0.08, 0.18)
  // Другий «дзень» (вищий, коротший — як ехо)
  playBeep(ctx, 1320, now + 0.09, 0.06, 0.14)
}

/**
 * Звук успіху — м'який «дзинь»: два чистих тони мажорної терції (C6 → E6),
 * другий вищий і з довшим хвостом. ~0.4с.
 */
export function playSuccessSound() {
  if (muted) return
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }

  const now = ctx.currentTime
  // Дві ноти мажорної терції — приємне, гармонійне поєднання
  playTone(ctx, 1046.5, now, 0.18, 0.1) // C6
  playTone(ctx, 1318.5, now + 0.11, 0.34, 0.11) // E6 — вищий, з довшим хвостом
}

/**
 * М'який дзвінкий тон. Основний sine + тиха октава для делікатного блиску.
 * Низькочастотний фільтр прибирає різкість.
 */
function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  peakGain: number,
) {
  // Фільтр — зрізає різкі верхи, робить звук теплим
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 3500
  filter.connect(ctx.destination)

  // Основний тон
  const osc1 = ctx.createOscillator()
  const gain1 = ctx.createGain()
  osc1.type = 'sine'
  osc1.frequency.value = frequency

  // Октава вище — делікатний блиск (тихо)
  const osc2 = ctx.createOscillator()
  const gain2 = ctx.createGain()
  osc2.type = 'sine'
  osc2.frequency.value = frequency * 2

  const attack = 0.012

  gain1.gain.setValueAtTime(0, startTime)
  gain1.gain.linearRampToValueAtTime(peakGain, startTime + attack)
  gain1.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

  gain2.gain.setValueAtTime(0, startTime)
  gain2.gain.linearRampToValueAtTime(peakGain * 0.18, startTime + attack)
  gain2.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.6)

  osc1.connect(gain1)
  gain1.connect(filter)
  osc2.connect(gain2)
  gain2.connect(filter)

  const stopTime = startTime + duration + 0.05
  osc1.start(startTime)
  osc1.stop(stopTime)
  osc2.start(startTime)
  osc2.stop(stopTime)
}

/**
 * Окремий звук для «надіслане» — приглушений короткий «фьюх».
 */
export function playSentSound() {
  if (muted) return
  const ctx = getCtx()
  if (!ctx || ctx.state !== 'running') return

  const now = ctx.currentTime
  playBeep(ctx, 660, now, 0.03, 0.08)
}

function playBeep(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  peakGain: number,
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.value = frequency

  // ADSR-обвідна — швидкий attack, плавний release щоб не клацало
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(startTime)
  osc.stop(startTime + duration + 0.05)
}

// ─── Mute toggle (зберігається у localStorage) ───

export function loadMutePreference() {
  if (!browser) return
  muted = localStorage.getItem('chat-sound-muted') === '1'
}

export function setMuted(value: boolean) {
  muted = value
  if (browser) {
    localStorage.setItem('chat-sound-muted', value ? '1' : '0')
  }
}

export function isMuted(): boolean {
  return muted
}
