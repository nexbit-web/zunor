// Голосовий ввід для панелі чату: браузер сам розпізнає мову й віддає
// текст, який ми просто дописуємо в поле вводу.
//
// Web Speech API, а не запис аудіо з відправкою на сервер: розпізнавання
// відбувається на пристрої (у Chrome — через сервіси Google, але без
// нашої участі), тож нам не треба ні зберігати звук, ні платити за
// транскрипцію, ні тримати ще один ключ. Ціна — підтримка нерівна:
// Chrome і Safari вміють, Firefox станом на зараз ні. Тому `supported`
// перевіряється завжди, а кнопка без підтримки просто не малюється:
// кнопка, яка при натисканні пояснює, що не працює, гірша за її
// відсутність.
//
// Мова — українська за замовчуванням. Розпізнавач приймає одну мову за
// сеанс, і саме нею говорить більшість клієнтів; російська вимова
// українською моделлю розпізнається прийнятно, а от перемикач мов у
// панелі вводу — зайвий контрол заради рідкого випадку.

/** Мінімальні типи Web Speech API: у lib.dom їх досі немає. */
interface SpeechAlternative {
  readonly transcript: string
}

interface SpeechResult {
  readonly length: number
  readonly isFinal: boolean
  readonly [index: number]: SpeechAlternative
}

interface SpeechResultList {
  readonly length: number
  readonly [index: number]: SpeechResult
}

interface SpeechResultEvent {
  readonly resultIndex: number
  readonly results: SpeechResultList
}

interface SpeechErrorEvent {
  readonly error: string
}

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: ((event: SpeechErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

type RecognitionCtor = new () => Recognition

interface DictationOptions {
  /**
   * Увесь розпізнаний за сеанс текст — і остаточний, і той, що модель ще
   * уточнює. Приходить на КОЖНЕ оновлення, тож поле вводу оновлюється
   * прямо під час говоріння, як у голосовому наборі телефона.
   */
  onChange: (transcript: string) => void
  /** Людський текст помилки — показати тостом. */
  onError?: (message: string) => void
  lang?: string
}

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null

  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }

  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export class Dictation {
  listening = $state(false)

  readonly #ctor = recognitionCtor()
  readonly #options: DictationOptions

  #rec: Recognition | null = null

  /** Остаточні шматки за сеанс: проміжні щоразу переписуються наново. */
  #final = ''

  constructor(options: DictationOptions) {
    this.#options = options
  }

  get supported(): boolean {
    return this.#ctor !== null
  }

  start(): void {
    if (!this.#ctor || this.listening) return

    const rec = new this.#ctor()

    rec.lang = this.#options.lang ?? 'uk-UA'
    // continuous: розпізнавач не має зупинятись після першої ж паузи —
    // людина диктує «прибрати двокімнатну… ем… у центрі», і пауза на
    // роздуми не привід обірвати запис.
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onresult = (event) => {
      let interim = ''

      // Від resultIndex, а не з нуля: уже остаточні шматки браузер
      // більше не надсилає, і повторний прохід дублював би текст.
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''

        if (result.isFinal) this.#final += text
        else interim += text
      }

      this.#options.onChange((this.#final + interim).trim())
    }

    rec.onerror = (event) => {
      // no-speech і aborted — не помилки, а звичайний перебіг: людина
      // помовчала або сама натиснула «стоп». Тост про них був би
      // причіпкою на порожньому місці.
      if (event.error === 'no-speech' || event.error === 'aborted') return

      this.#options.onError?.(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Немає доступу до мікрофона — дозволь його в налаштуваннях браузера'
          : 'Не вдалося розпізнати голос. Спробуй ще раз',
      )
    }

    // Браузер зупиняє розпізнавання й сам (довга тиша, втрата фокуса
    // вкладки), тож стан кнопки веде саме onend, а не наш виклик stop().
    rec.onend = () => {
      this.listening = false
      this.#rec = null
    }

    this.#rec = rec
    this.#final = ''
    this.listening = true

    try {
      rec.start()
    } catch {
      // start() на вже запущеному екземплярі кидає InvalidStateError.
      this.listening = false
      this.#rec = null
    }
  }

  stop(): void {
    if (!this.#rec) return
    // stop(), а не abort(): останню фразу треба дорозпізнати й віддати,
    // інакше кінець продиктованого мовчки зникає.
    this.#rec.stop()
  }

  toggle(): void {
    if (this.listening) this.stop()
    else this.start()
  }

  /** Для onDestroy: далі слухати нема кому. */
  destroy(): void {
    this.#rec?.abort()
    this.#rec = null
    this.listening = false
  }
}
