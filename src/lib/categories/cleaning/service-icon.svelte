<!--
  Іконки послуг — власний набір, а не lucide: у списку заявок тип прибирання
  читається з іконки ще до назви, і загальні «зірочки» на кожному рядку нічого
  не розрізняли.

  Одна мова для всіх шести: сітка 24, контур 1.6 з круглими кінцями, тіло
  предмета — ледь залите кольором тексту (.b), і рівно ОДНА деталь кольором
  акценту (.a / .a-fill): піна, відблиск, іскра. Акцент — це --primary, тож
  набір сам іде за кольором, який людина обрала в налаштуваннях.

  Розмітка — у шаблоні, а не рядком через {@html}: інших {@html} у проєкті
  бути не повинно (AGENTS.md, «Безпека»).
-->
<script lang="ts">
  let { service, class: className = '' }: { service: unknown; class?: string } =
    $props()

  const key = $derived(typeof service === 'string' ? service : '')
</script>

<svg
  class={['svc', className]}
  viewBox="0 0 24 24"
  aria-hidden="true"
  focusable="false"
>
  {#if key === 'standard'}
    <!-- Звичайне — пульверизатор -->
    <path
      class="b"
      d="M8.2 11h5.6a1.2 1.2 0 0 1 1.2 1.2V19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-6.8A1.2 1.2 0 0 1 8.2 11Z"
    />
    <path d="M9.4 11V8.6h3.2V11" />
    <path
      d="M8.6 8.6h5.2l1.6-2.1V5.1a1.1 1.1 0 0 0-1.1-1.1H9.2a1.1 1.1 0 0 0-1.1 1.1v1.4"
    />
    <path d="M15.4 5h1.5M9.4 15.2h3.2" />
    <g class="a-fill">
      <circle cx="19.4" cy="3.4" r=".9" />
      <circle cx="20.6" cy="6" r=".9" />
      <circle cx="19.4" cy="8.6" r=".9" />
    </g>
  {:else if key === 'post-renovation'}
    <!-- Після ремонту — валик -->
    <rect class="b" x="3.6" y="3.4" width="13.4" height="5.6" rx="2" />
    <path
      d="M17 6.2h2.2a1.1 1.1 0 0 1 1.1 1.1v3.2a1.1 1.1 0 0 1-1.1 1.1h-6.9a1.1 1.1 0 0 0-1.1 1.1V14"
    />
    <rect class="b" x="9.9" y="14" width="2.6" height="7" rx="1.1" />
    <path class="a" d="M6.6 6.2h4.6" />
    <path
      class="a-fill"
      d="M5.2 13.4c.25 1.05.75 1.55 1.8 1.8-1.05.25-1.55.75-1.8 1.8-.25-1.05-.75-1.55-1.8-1.8 1.05-.25 1.55-.75 1.8-1.8Z"
    />
  {:else if key === 'windows'}
    <!-- Миття вікон — вікно з відблиском -->
    <rect class="b" x="4.5" y="3.2" width="15" height="15.6" rx="1.6" />
    <path d="M12 3.2v15.6M4.5 11h15M3 21h18" />
    <path class="a" d="M6.8 8.6 9.6 5.8M7 10.6l4-4M14.4 16.4l2.6-2.6" />
  {:else if key === 'sofa'}
    <!-- Хімчистка — диван із бульбашками -->
    <path d="M6 11.3V8.8A2.6 2.6 0 0 1 8.6 6.2h6.8A2.6 2.6 0 0 1 18 8.8v2.5" />
    <path
      class="b"
      d="M5 11.2a2 2 0 0 0-2 2v4.1a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4.1a2 2 0 0 0-4 0v1.3H7v-1.3a2 2 0 0 0-2-2Z"
    />
    <path d="M12 6.2v8.3M6 18.3V20M18 18.3V20" />
    <g class="a">
      <circle cx="19.2" cy="3.6" r="1.5" />
      <circle cx="21.4" cy="7" r=".8" />
    </g>
  {:else if key === 'regular'}
    <!-- Регулярне — той самий день щотижня позначений акцентом -->
    <rect class="b" x="3.6" y="5" width="16.8" height="15.6" rx="2.4" />
    <path d="M8 3.2v3.4M16 3.2v3.4M3.6 9.6h16.8" />
    <g class="dot">
      <circle cx="12" cy="13.3" r="1" />
      <circle cx="16" cy="13.3" r="1" />
      <circle cx="12" cy="17" r="1" />
      <circle cx="16" cy="17" r="1" />
    </g>
    <g class="a-fill">
      <circle cx="8" cy="13.3" r="1.35" />
      <circle cx="8" cy="17" r="1.35" />
    </g>
  {:else}
    <!-- Генеральне (і стара заявка без послуги) — відро з піною та іскрою -->
    <path
      class="b"
      d="M5.2 11.5h13.6l-1.4 8a2 2 0 0 1-2 1.7H8.6a2 2 0 0 1-2-1.7Z"
    />
    <path d="M4.2 11.5h15.6M6.3 15.4h11.4" />
    <path
      d="M7.1 11.4a2 2 0 0 1 1.9-2.6 2.6 2.6 0 0 1 4.9-.3 1.9 1.9 0 0 1 2.9 2.9"
    />
    <path
      class="a-fill"
      d="M19 2.2c.3 1.3.9 1.9 2.2 2.2-1.3.3-1.9.9-2.2 2.2-.3-1.3-.9-1.9-2.2-2.2 1.3-.3 1.9-.9 2.2-2.2Z"
    />
  {/if}
</svg>

<style>
  .svc {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .b {
    fill: currentColor;
    fill-opacity: 0.1;
  }
  .a {
    stroke: var(--primary);
  }
  .a-fill {
    fill: var(--primary);
    stroke: none;
  }
  .dot {
    fill: currentColor;
    stroke: none;
    opacity: 0.45;
  }
</style>
