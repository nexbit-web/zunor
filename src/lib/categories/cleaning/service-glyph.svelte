<!--
  Сплошні іконки послуг 40×40 — для меню «Послуги» в шапці, у мові
  піктограм ClickUp: суцільний силует кольором тексту, деталі вирізані
  (прозорі), дрібні елементи окремо поруч. Контурний набір для
  застосунку — service-icon.svelte; цей — для лендингу, де іконка
  велика й мусить читатися плямою.

  Вирізи — через <mask>: так деталь справді прозора й у темній темі
  показує тло, а не білу латку. id масок — з $props.id(), бо та сама
  іконка буває на сторінці двічі (меню й мобільне меню).
-->
<script lang="ts">
  let { service, class: className = '' }: { service: unknown; class?: string } =
    $props()

  const uid = $props.id()
  const id = (name: string) => `${uid}-${name}`

  /** Чотирипроменева іскра з увігнутими боками. */
  function sparkle(cx: number, cy: number, r: number, k = 0.2): string {
    const c = r * k
    return (
      `M${cx} ${cy - r}Q${cx + c} ${cy - c} ${cx + r} ${cy}` +
      `Q${cx + c} ${cy + c} ${cx} ${cy + r}` +
      `Q${cx - c} ${cy + c} ${cx - r} ${cy}` +
      `Q${cx - c} ${cy - c} ${cx} ${cy - r}Z`
    )
  }
</script>

<svg
  viewBox="0 0 40 40"
  fill="currentColor"
  class={className}
  aria-hidden="true"
>
  {#if service === 'standard'}
    <!-- Звичайне: пульверизатор з іскрою на корпусі -->
    <mask id={id('a')} maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40">
      <rect width="40" height="40" fill="white" />
      <path d={sparkle(21.75, 26.5, 6)} fill="black" />
    </mask>
    <g mask="url(#{id('a')})">
      <rect x="12" y="3" width="16" height="9" rx="3" />
      <rect x="4.5" y="4.5" width="9" height="4.5" rx="1.5" />
      <rect x="17.5" y="11" width="8" height="5.5" />
      <rect x="13" y="15.5" width="17.5" height="21.5" rx="5.5" />
    </g>
    <!-- Курок окремо від корпусу: так пляма читається як пульверизатор -->
    <path
      d="M13.6 11.4 9.4 18.2"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
    />
    <g>
    </g>
    <circle cx="1.9" cy="3.4" r="1.25" />
    <circle cx="1.6" cy="6.75" r="1.25" />
    <circle cx="1.9" cy="10.1" r="1.25" />
  {:else if service === 'deep'}
    <!-- Генеральне: відро зі шваброю -->
    <mask id={id('a')} maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40">
      <rect width="40" height="40" fill="white" />
      <rect x="9" y="24" width="22" height="2.2" fill="black" />
    </mask>
    <mask id={id('stick')} maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40">
      <rect width="40" height="40" fill="white" />
      <rect x="3.5" y="12" width="33" height="8.5" rx="4" fill="black" />
    </mask>
    <path
      d="M20.5 16 33 2.6"
      stroke="currentColor"
      stroke-width="3.4"
      stroke-linecap="round"
      mask="url(#{id('stick')})"
    />
    <circle cx="11.3" cy="8.6" r="2.5" />
    <circle cx="16.6" cy="6.2" r="1.6" />
    <circle cx="8.2" cy="3.6" r="1.3" />
    <g mask="url(#{id('a')})">
      <rect x="5" y="13.5" width="30" height="5.5" rx="2.75" />
      <path
        d="M8 18.5h24l-2.4 15.7a3 3 0 0 1-3 2.6H13.4a3 3 0 0 1-3-2.6z"
      />
    </g>
  {:else if service === 'post-renovation'}
    <!-- Після ремонту: валик із фарбою -->
    <mask id={id('a')} maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40">
      <rect width="40" height="40" fill="white" />
      <rect x="8.5" y="7.6" width="14" height="2" rx="1" fill="black" />
    </mask>
    <g mask="url(#{id('a')})">
      <rect x="4" y="4" width="26.5" height="11" rx="4" />
    </g>
    <rect x="8" y="13" width="3.2" height="7" rx="1.6" />
    <rect x="14.2" y="13" width="3" height="4.5" rx="1.5" />
    <path
      d="M30 9.5h4.6V20.4H21v3"
      fill="none"
      stroke="currentColor"
      stroke-width="3.2"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
    <rect x="17.5" y="23" width="7" height="14.5" rx="3.5" />
  {:else if service === 'windows'}
    <!-- Миття вікон: вікно з відблисками на склі -->
    <mask id={id('a')} maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40">
      <rect width="40" height="40" fill="white" />
      <rect x="9" y="7" width="9.5" height="10" rx="1.5" fill="black" />
      <rect x="21.5" y="7" width="9.5" height="10" rx="1.5" fill="black" />
      <rect x="9" y="20" width="9.5" height="10" rx="1.5" fill="black" />
      <rect x="21.5" y="20" width="9.5" height="10" rx="1.5" fill="black" />
    </mask>
    <g mask="url(#{id('a')})">
      <rect x="5" y="3" width="30" height="31" rx="5" />
    </g>
    <rect x="2" y="33" width="36" height="4.5" rx="2.25" />
    <g stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M11.8 14.2 15.8 10.2" />
      <path d="M11.8 10.4 12.8 9.4" />
      <path d="M24.3 27.2 28.3 23.2" />
    </g>
  {:else if service === 'sofa'}
    <!-- Хімчистка: диван і крапля -->
    <mask id={id('body')} maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40">
      <rect width="40" height="40" fill="white" />
      <rect x="1" y="13.5" width="11" height="20" rx="5" fill="black" />
      <rect x="28" y="13.5" width="11" height="20" rx="5" fill="black" />
      <rect x="10" y="21.2" width="20" height="1.7" fill="black" />
      <circle cx="31" cy="8" r="8.6" fill="black" />
    </mask>
    <mask id={id('arms')} maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40">
      <rect width="40" height="40" fill="white" />
      <circle cx="31" cy="8" r="8.6" fill="black" />
    </mask>
    <mask id={id('drop')} maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40">
      <rect width="40" height="40" fill="white" />
      <path
        d="M31 3.9c0 0-3.2 3.6-3.2 5.5a3.2 3.2 0 0 0 6.4 0c0-1.9-3.2-5.5-3.2-5.5z"
        fill="black"
      />
    </mask>
    <g mask="url(#{id('body')})">
      <rect x="7.5" y="9" width="25" height="14" rx="4" />
      <rect x="7.5" y="21" width="25" height="11" rx="1.5" />
    </g>
    <g mask="url(#{id('arms')})">
      <rect x="2.5" y="15" width="8" height="17" rx="4" />
      <rect x="29.5" y="15" width="8" height="17" rx="4" />
      <rect x="4.5" y="30" width="4" height="6" rx="1.4" />
      <rect x="31.5" y="30" width="4" height="6" rx="1.4" />
    </g>
    <g mask="url(#{id('drop')})">
      <circle cx="31" cy="8" r="6.6" />
    </g>
  {:else if service === 'regular'}
    <!-- Регулярне: календар зі стрілками повтору -->
    <mask id={id('a')} maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40">
      <rect width="40" height="40" fill="white" />
      <rect x="9.5" y="0.5" width="7" height="12.5" rx="3.5" fill="black" />
      <rect x="23.5" y="0.5" width="7" height="12.5" rx="3.5" fill="black" />
      <rect x="4" y="14" width="32" height="2.2" fill="black" />
      <g fill="none" stroke="black" stroke-width="2.6" stroke-linecap="round">
        <path d="M14.55 24.52A5.8 5.8 0 0 1 25.45 24.52" />
        <path d="M25.45 28.48A5.8 5.8 0 0 1 14.55 28.48" />
      </g>
      <path d="M26.3 26.9 28 22.6 22.6 24.6z" fill="black" />
      <path d="M13.7 26.1 12 30.4 17.4 28.4z" fill="black" />
    </mask>
    <g mask="url(#{id('a')})">
      <rect x="4" y="6.5" width="32" height="30" rx="5" />
    </g>
    <rect x="11" y="2.5" width="4" height="9" rx="2" />
    <rect x="25" y="2.5" width="4" height="9" rx="2" />
  {:else}
    <!-- Невідома послуга: іскра, а не порожнє місце -->
    <path d={sparkle(20, 20, 16, 0.18)} />
  {/if}
</svg>
