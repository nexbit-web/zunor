<script lang="ts" module>
  /**
   * Що на плитці. Свої знаки — біла суцільна іконка на кольорі; чужі
   * сервіси — їхні справжні знаки: людина впізнає Google і Telegram з
   * першого погляду.
   */
  export type SettingsTileKind =
    | 'mail'
    | 'key'
    | 'sound'
    | 'google'
    | 'telegram'
</script>

<script lang="ts">
  // Кольорова плитка ліворуч від рядка налаштувань — як у мобільному
  // застосунку (mobile/src/components/ui/tile.tsx і icons/brand-tiles.tsx,
  // власник): системні кольори iOS, легкий відблиск згори вниз, біла
  // суцільна іконка. Колір — лише впізнаваність рядка, тому він не
  // залежить ні від теми, ні від обраного акценту.

  interface Props {
    kind: SettingsTileKind
    /** Сторона плитки, px. */
    size?: number
  }

  let { kind, size = 32 }: Props = $props()

  // Ті самі кольори, що TINT у застосунку.
  const TINT: Record<'mail' | 'key' | 'sound', string> = {
    mail: '#007aff',
    key: '#8e8e93',
    sound: '#ff3b30',
  }

  const radius = $derived(Math.round(size * 0.27))
</script>

{#if kind === 'google'}
  <!-- Багатобарвна «G» на білій плитці, як значок застосунку Google.
       Тонка межа — щоб біла плитка не зливалась зі світлою карткою. -->
  <span
    class="tile tile-google"
    style:width="{size}px"
    style:height="{size}px"
    style:border-radius="{radius}px"
    aria-hidden="true"
  >
    <svg viewBox="0 0 48 48" width={Math.round(size * 0.58)}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  </span>
{:else if kind === 'telegram'}
  <!-- Білий паперовий літачок на блакитному градієнті, як значок
       Telegram на iPhone. Контури — офіційного знака (сітка 240). -->
  <span
    class="tile tile-telegram"
    style:width="{size}px"
    style:height="{size}px"
    style:border-radius="{radius}px"
    aria-hidden="true"
  >
    <svg viewBox="0 0 240 240" width={size} height={size}>
      <path
        fill="#ffffff"
        transform="translate(14 8) scale(0.92)"
        d="M54.3 118.8c35-15.2 58.3-25.3 70-30.2 33.3-13.9 40.3-16.3 44.8-16.4 1 0 3.2.2 4.7 1.4 1.2 1 1.5 2.3 1.7 3.3s.4 3.1.2 4.7c-1.8 19-9.6 65.1-13.6 86.3-1.7 9-5 12-8.2 12.3-7 .6-12.3-4.6-19-9-10.6-6.9-16.5-11.2-26.8-18-11.9-7.8-4.2-12.1 2.6-19.1 1.8-1.8 32.5-29.8 33.1-32.3.1-.3.1-1.5-.6-2.1-.7-.6-1.7-.4-2.5-.2-1.1.2-17.9 11.4-50.6 33.5-4.8 3.3-9.1 4.9-13 4.8-4.3-.1-12.5-2.4-18.7-4.4-7.5-2.4-13.5-3.7-13-7.9.3-2.2 3.3-4.4 8.9-6.7z"
      />
    </svg>
  </span>
{:else}
  <span
    class="tile tile-tint"
    style:width="{size}px"
    style:height="{size}px"
    style:border-radius="{radius}px"
    style:--tint={TINT[kind]}
    aria-hidden="true"
  >
    <svg
      viewBox="0 0 24 24"
      width={Math.round(size * 0.6)}
      height={Math.round(size * 0.6)}
      fill="#ffffff"
    >
      {#if kind === 'mail'}
        <!-- Конверт, суцільний (envelope.fill): клапан і корпус. -->
        <path
          d="M4.5 4.75h15A2.5 2.5 0 0 1 22 7.25v.3l-9.48 5.69a1 1 0 0 1-1.04 0L2 7.55v-.3a2.5 2.5 0 0 1 2.5-2.5Z"
        />
        <path
          d="M2 9.88l8.45 5.07a3 3 0 0 0 3.1 0L22 9.88v6.87a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 16.75Z"
        />
      {:else if kind === 'key'}
        <!-- Ключ, суцільний (key.fill): кільце з отвором і борідка. -->
        <path
          fill-rule="evenodd"
          d="M7.5 6.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm-1.25 3.6a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8Z"
        />
        <path
          d="M12 10.6h9.1a1 1 0 0 1 1 1v.8a1 1 0 0 1-1 1h-.6v2.1a.9.9 0 0 1-.9.9h-.9a.9.9 0 0 1-.9-.9v-2.1h-1.4v1.4a.9.9 0 0 1-.9.9h-.8a.9.9 0 0 1-.9-.9v-1.4H12Z"
        />
      {:else}
        <!-- Гучномовець із хвилями (speaker.wave.2.fill). -->
        <path
          d="M2.5 9.6A1.6 1.6 0 0 1 4.1 8h2.6l4.55-3.8A1 1 0 0 1 12.9 5v14a1 1 0 0 1-1.65.8L6.7 16H4.1a1.6 1.6 0 0 1-1.6-1.6Z"
        />
        <path
          d="M15.6 8.9a4.4 4.4 0 0 1 0 6.2M18.4 6.2a8.2 8.2 0 0 1 0 11.6"
          fill="none"
          stroke="#ffffff"
          stroke-width="2"
          stroke-linecap="round"
        />
      {/if}
    </svg>
  </span>
{/if}

<style>
  .tile {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  /* Відблиск згори вниз, як у плиток застосунку: плитка обʼємна, а не
     пласка наліпка. */
  .tile-tint {
    background:
      linear-gradient(rgb(255 255 255 / 0.24), rgb(255 255 255 / 0)),
      var(--tint);
  }

  .tile-telegram {
    background: linear-gradient(#2aabee, #229ed9);
  }

  .tile-google {
    background: #ffffff;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.1);
  }
</style>
