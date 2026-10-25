<script lang="ts">
  // Поле з підписом усередині рамки (як у формах Apple ID).
  //
  // Чому не звичайний label над полем: у високій формі кожен підпис
  // забирає власний рядок, і вісім полів перетворюються на шістнадцять.
  // Тут підпис живе в самому полі: доки воно порожнє — він на місці
  // плейсхолдера, щойно з'явився текст — від'їжджає вгору й лишається
  // видимим. Тобто питання «що я сюди ввів?» не зникає разом із фокусом,
  // як це буває з чистим placeholder.
  //
  // Механіка — на :placeholder-shown, без жодного JS: placeholder=" "
  // (саме пробіл) потрібен, щоб селектор перемикався по НАЯВНОСТІ
  // тексту, а не по фокусу. Порожній placeholder="" браузер вважає
  // відсутнім, і селектор не спрацював би ніколи.
  //
  // Помилку малює саме поле, а не сторінка: текст помилки, колір рамки
  // й підпису, іконка та зв'язок через aria-describedby — це один стан,
  // і збирати його руками в кожній формі означає рано чи пізно десь
  // забути половину.

  import type { Snippet } from 'svelte'
  import type { HTMLInputAttributes } from 'svelte/elements'
  import { CircleAlert } from 'lucide-svelte'

  interface Props extends Omit<
    HTMLInputAttributes,
    'value' | 'placeholder' | 'aria-invalid'
  > {
    id: string
    label: string
    value?: string
    /** Текст помилки під полем. Непорожній рядок сам робить поле невалідним. */
    error?: string
    /** Невалідність без власного тексту (помилку показує щось інше). */
    invalid?: boolean
    /** Контрол праворуч у полі — наприклад «показати пароль». */
    trailing?: Snippet
  }

  let {
    id,
    label,
    value = $bindable(''),
    error = '',
    invalid = false,
    trailing,
    class: className,
    ...rest
  }: Props = $props()

  const isInvalid = $derived(invalid || !!error)
</script>

<div class="field-wrap {className ?? ''}">
  <div class="field" class:has-trailing={!!trailing}>
    <input
      {id}
      bind:value
      placeholder=" "
      aria-invalid={isInvalid || undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      class="field-input"
      {...rest}
    />

    <!-- Підпис ПІСЛЯ поля: селектор `input:not(:placeholder-shown) + label`
         працює лише на сусіда, що йде слідом. -->
    <label for={id} class="field-label">{label}</label>

    {#if trailing}
      <span class="field-trailing">{@render trailing()}</span>
    {/if}
  </div>

  {#if error}
    <p id="{id}-error" class="field-error" role="alert">
      <CircleAlert aria-hidden="true" />
      {error}
    </p>
  {/if}
</div>

<style>
  .field-wrap {
    width: 100%;
  }

  .field {
    position: relative;
    width: 100%;
  }

  .field-input {
    width: 100%;
    height: 56px;
    /* Верхній падінг більший за нижній: у полі з текстом підпис стоїть
       саме там, і без цього запасу він наклався б на введене. */
    padding: 24px 16px 6px;
    border: 1px solid var(--input);
    /* Один радіус на всі контроли сайту — поле, textarea, список міст,
       кнопка. Різні скруглення в одній колонці одразу видно оком. */
    border-radius: 10px;
    background: var(--field);
    color: var(--foreground);
    font-size: 16px;
    line-height: 1.25;
    outline: none;
    transition:
      border-color 0.18s ease,
      background-color 0.18s ease,
      box-shadow 0.18s ease;
  }

  .has-trailing .field-input {
    padding-inline-end: 48px;
  }

  .field-input:hover {
    border-color: var(--input-hover);
  }

  /* На фокусі рамка «товщає» до 2px, але border-width не міняється:
     пів пікселя домальовує тінь того ж кольору впритул до рамки.
     Коли товщина справді росла, поле смикалось — border-width
     перемикається миттєво, а компенсуючий падінг їхав анімацією, і
     текст усередині повз. */
  .field-input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 1px var(--primary);
  }

  /* Невалідне поле червоне цілком: рамка, підпис і ледь помітна заливка.
     Сама рамка на темному тлі читається слабко — заливка дає полю вагу,
     і помилку видно периферійним зором, не вчитуючись у підпис. */
  .field-input[aria-invalid='true'] {
    border-color: var(--destructive);
    background: color-mix(in srgb, var(--destructive) 8%, var(--field));
  }

  .field-input[aria-invalid='true'] + .field-label {
    color: var(--destructive);
  }

  /* Кільце на фокусі теж червоне: синє поверх червоної рамки читалось би
     як «помилку виправлено», хоча вона ще на місці. */
  .field-input[aria-invalid='true']:focus {
    border-color: var(--destructive);
    box-shadow: 0 0 0 1px var(--destructive);
  }

  .field-label {
    position: absolute;
    inset-inline-start: 17px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted-foreground);
    font-size: 16px;
    line-height: 1;
    pointer-events: none;
    transition:
      top 0.18s ease,
      transform 0.18s ease,
      font-size 0.18s ease,
      color 0.18s ease;
  }

  .field-input:focus + .field-label,
  .field-input:not(:placeholder-shown) + .field-label {
    top: 12px;
    transform: translateY(0);
    font-size: 12px;
  }

  /* Колір підпису не міняється на фокусі: синій підпис над синьою рамкою
     — два акценти на один контрол. Червоним він стає лише в помилці. */

  .field-trailing {
    position: absolute;
    inset-inline-end: 8px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
  }

  /* Рядок помилки: звичайна вага, а не напівжирна. Жирний червоний текст
     кричить сильніше, ніж того вартує друкарська помилка в пошті. */
  .field-error {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 5px;
    padding-inline-start: 2px;
    color: var(--destructive);
    font-size: 13px;
    font-weight: 400;
    line-height: 1.3;
  }

  .field-error :global(svg) {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .field-input,
    .field-label {
      transition: none;
    }
  }
</style>
