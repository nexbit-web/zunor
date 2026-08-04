// Звук сповіщень на Web Audio API.
//
// Генеруємо тон кодом, а не тягнемо mp3: нема мережевого запиту,
// нема 404 при відсутньому файлі, нема затримки на першому відтворенні.
//
// Client-only: усі звернення до AudioContext і localStorage під `browser`.

import { browser } from '$app/environment'

const STORAGE_KEY = 'notification-sound-enabled'

/** Один контекст на застосунок. Браузери обмежують їх кількість,
 *  і новий на кожне сповіщення швидко впреться в ліміт. */
let ctx: AudioContext | null = null

type AudioCtor = typeof AudioContext

function getContext(): AudioContext | null {
  if (!browser) return null

  // webkitAudioContext — Safari до 14.1.
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext

  if (!Ctor) return null

  try {
    ctx ??= new Ctor()
    return ctx
  } catch {
    return null
  }
}

/** Три висхідні тони: 330 → 440 → 660 Hz, із затримками.
 *  Lowpass на 2000 Hz прибирає різкість — інакше синуси звучать «скляно». */
function playTone(ctx: AudioContext): void {
  const now = ctx.currentTime

  const master = ctx.createGain()
  // Плавний старт: миттєвий стрибок гучності дає цифровий клац.
  master.gain.setValueAtTime(0, now)
  master.gain.linearRampToValueAtTime(0.9, now + 0.02)
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.7)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 2000

  master.connect(filter)
  filter.connect(ctx.destination)

  // [частота, зсув старту, пікова гучність, момент згасання]
  const voices: readonly [number, number, number, number][] = [
    [330, 0, 0.8, 0.5],
    [440, 0.08, 0.7, 0.55],
    [660, 0.18, 0.6, 0.6],
  ]

  for (const [freq, delay, peak, fadeEnd] of voices) {
    const start = now + delay

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, start)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(peak, start + 0.02)
    // exponentialRamp не приймає 0 — тому 0.001 замість нуля.
    gain.gain.exponentialRampToValueAtTime(0.001, now + fadeEnd)

    osc.connect(gain)
    gain.connect(master)

    osc.start(start)
    // Із запасом після згасання: обрив на піку чути як клац.
    osc.stop(now + 0.7)
  }
}

class NotificationSound {
  // За замовчуванням увімкнено: людина очікує почути сповіщення,
  // а вимкнути може одним кліком.
  enabled = $state(
    browser ? localStorage.getItem(STORAGE_KEY) !== 'false' : true,
  )

  toggle(): void {
    this.setEnabled(!this.enabled)
  }

  setEnabled(value: boolean): void {
    this.enabled = value
    if (!browser) return

    localStorage.setItem(STORAGE_KEY, String(value))

    // Програємо одразу при вмиканні: людина чує, що саме обрала,
    // і заразом клік розблоковує AudioContext на всю сесію.
    if (value) this.play()
  }

  play(): void {
    if (!browser || !this.enabled) return

    const audio = getContext()
    if (!audio) return

    // Контекст засинає, поки не було взаємодії зі сторінкою.
    // resume() спрацює лише після кліку — це штатна поведінка браузера.
    if (audio.state === 'suspended') void audio.resume().catch(() => {})

    try {
      playTone(audio)
    } catch (err) {
      console.error('[notification-sound]', err)
    }
  }
}

export const notificationSound = new NotificationSound()
