<!-- Піксель-арт 68x56. viewBox обрізаний рівно по малюнку: своїх полів SVG не
     має, відступи задає gap контейнера, а розмір — клас ззовні (досить ширини,
     height лишається auto). -->
<script lang="ts">
  interface Props {
    title?: string
    class?: string
  }

  let { title = '404 — сторінку не знайдено', class: className = '' }: Props =
    $props()
</script>

<svg
  width="272"
  height="224"
  viewBox="0 0 68 56"
  xmlns="http://www.w3.org/2000/svg"
  shape-rendering="crispEdges"
  role="img"
  aria-label={title}
  class={className}
>
  <path
    fill="var(--ant-sand, #F0D7BB)"
    d="M4 50h1v1h-1zM6 50h1v2h-1zM9 50h3v3h-3zM14 50h3v3h-3zM19 50h5v3h-5zM26 50h4v4h-4zM32 50h6v2h-6zM63 50h1v1h-1zM0 51h1v1h-1zM2 51h2v1h-2zM7 51h2v2h-2zM12 51h2v2h-2zM17 51h2v2h-2zM24 51h2v3h-2zM30 51h2v3h-2zM38 51h2v2h-2zM64 51h1v1h-1zM67 51h1v1h-1zM32 52h3v2h-3zM40 52h2v2h-2zM52 52h11v1h-11zM22 53h2v1h-2zM35 53h4v1h-4zM42 53h10v1h-10z"
  />
  <path
    fill="var(--ant-orange, #ED6D4B)"
    d="M56 0h1v1h-1zM17 1h2v2h-2zM32 1h5v1h-5zM54 1h2v2h-2zM16 2h1v2h-1zM31 2h1v2h-1zM37 2h1v2h-1zM53 2h1v2h-1zM15 3h1v2h-1zM18 3h1v12h-1zM30 3h1v10h-1zM38 3h2v1h-2zM52 3h1v2h-1zM55 3h1v12h-1zM14 4h1v1h-1zM39 4h1v9h-1zM51 4h1v2h-1zM13 5h1v2h-1zM50 5h1v2h-1zM12 6h1v2h-1zM49 6h1v1h-1zM11 8h1v1h-1zM48 8h1v1h-1zM47 9h1v3h-1zM10 10h1v2h-1zM48 10h1v2h-1zM11 11h7v1h-7zM19 11h3v1h-3zM49 11h6v1h-6zM56 11h3v1h-3zM31 12h1v2h-1zM37 13h1v1h-1zM32 14h5v1h-5zM38 26h1v1h-1zM27 31h3v5h-3zM25 32h2v10h-2zM30 32h8v4h-8zM24 33h1v8h-1zM38 33h1v9h-1zM23 34h1v6h-1zM39 34h1v6h-1zM27 36h1v6h-1zM30 36h6v7h-6zM16 38h1v4h-1zM13 39h1v1h-1zM15 39h1v5h-1zM17 39h1v2h-1zM28 39h2v4h-2zM36 39h2v3h-2zM14 40h1v5h-1zM19 40h1v5h-1zM12 41h2v1h-2zM18 41h1v5h-1zM20 41h1v5h-1zM11 42h1v1h-1zM13 42h1v4h-1zM39 42h1v1h-1zM12 43h1v2h-1zM17 43h1v1h-1zM21 43h1v3h-1zM10 44h1v2h-1zM22 44h1v2h-1zM15 45h1v1h-1zM28 45h1v1h-1zM9 46h1v2h-1zM14 46h1v2h-1zM19 46h1v1h-1zM18 47h1v2h-1zM24 47h1v1h-1z"
  />
  <path
    fill="var(--ant-orange-mid, #D75E3F)"
    d="M18 0h2v1h-2zM34 0h4v1h-4zM54 0h2v1h-2zM16 1h1v1h-1zM19 1h1v10h-1zM31 1h1v1h-1zM37 1h1v1h-1zM53 1h1v1h-1zM56 1h1v10h-1zM32 2h1v1h-1zM36 2h1v1h-1zM38 2h1v1h-1zM40 3h1v10h-1zM50 4h1v1h-1zM14 5h1v2h-1zM31 5h1v7h-1zM52 5h1v1h-1zM51 6h1v1h-1zM11 7h1v1h-1zM13 7h1v1h-1zM48 7h3v1h-3zM12 8h1v1h-1zM49 8h1v1h-1zM10 9h2v1h-2zM48 9h1v1h-1zM11 10h1v1h-1zM13 10h2v1h-2zM16 10h2v1h-2zM20 10h3v1h-3zM49 10h6v1h-6zM57 10h3v1h-3zM22 11h1v1h-1zM59 11h1v1h-1zM17 12h1v1h-1zM19 12h1v1h-1zM37 12h2v1h-2zM54 12h1v1h-1zM56 12h2v1h-2zM30 13h1v1h-1zM32 13h1v1h-1zM36 13h1v1h-1zM38 13h2v1h-2zM56 13h1v3h-1zM19 14h1v1h-1zM31 14h1v1h-1zM37 14h1v1h-1zM18 15h1v1h-1zM55 15h1v1h-1zM28 21h2v2h-2zM40 23h2v2h-2zM25 24h1v1h-1zM24 25h1v1h-1zM39 25h1v1h-1zM37 27h1v1h-1zM24 31h3v1h-3zM30 31h5v1h-5zM36 31h1v1h-1zM22 32h3v1h-3zM38 32h1v1h-1zM22 33h2v1h-2zM21 34h2v5h-2zM15 38h1v1h-1zM17 38h2v1h-2zM14 39h1v1h-1zM19 39h1v1h-1zM22 39h1v1h-1zM12 40h2v1h-2zM20 40h1v1h-1zM23 40h1v1h-1zM39 40h1v1h-1zM11 41h1v1h-1zM21 41h1v2h-1zM24 41h1v1h-1zM12 42h1v1h-1zM16 42h2v1h-2zM22 42h1v2h-1zM25 42h3v1h-3zM36 42h2v1h-2zM11 43h1v1h-1zM23 43h1v2h-1zM17 44h1v2h-1zM24 44h3v1h-3zM12 45h1v1h-1zM19 45h1v1h-1zM24 45h1v1h-1zM27 45h1v1h-1zM10 46h1v1h-1zM13 46h1v1h-1zM15 46h1v1h-1zM20 46h2v1h-2zM23 46h1v2h-1zM28 46h1v1h-1zM19 47h1v1h-1zM29 47h1v1h-1zM8 48h2v1h-2zM14 48h1v1h-1zM24 48h2v2h-2zM30 48h1v2h-1zM8 49h1v1h-1zM13 49h1v1h-1zM18 49h1v1h-1zM17 50h1v1h-1z"
  />
  <path
    fill="var(--ant-orange-dark, #BC5740)"
    d="M16 0h2v1h-2zM31 0h3v1h-3zM53 0h1v1h-1zM15 1h1v2h-1zM30 1h1v2h-1zM38 1h1v1h-1zM52 1h1v2h-1zM33 2h3v1h-3zM39 2h1v1h-1zM14 3h1v1h-1zM17 3h1v7h-1zM29 3h1v11h-1zM32 3h1v1h-1zM36 3h1v1h-1zM51 3h1v1h-1zM54 3h1v7h-1zM13 4h1v1h-1zM16 4h1v1h-1zM31 4h1v1h-1zM37 4h2v8h-2zM49 4h1v2h-1zM53 4h1v1h-1zM12 5h1v1h-1zM15 5h1v1h-1zM11 6h1v1h-1zM48 6h1v1h-1zM10 7h1v2h-1zM47 7h1v2h-1zM9 9h1v4h-1zM46 9h1v4h-1zM12 10h1v1h-1zM15 10h1v1h-1zM10 12h7v1h-7zM20 12h3v1h-3zM32 12h1v1h-1zM36 12h1v1h-1zM47 12h7v1h-7zM58 12h2v1h-2zM17 13h1v3h-1zM19 13h1v1h-1zM33 13h3v1h-3zM40 13h1v1h-1zM54 13h1v3h-1zM30 14h1v1h-1zM38 14h1v1h-1zM19 15h1v1h-1zM31 15h7v1h-7zM26 21h2v2h-2zM25 23h2v1h-2zM24 24h1v1h-1zM39 24h1v1h-1zM23 25h1v7h-1zM38 25h1v1h-1zM37 26h1v1h-1zM36 27h1v4h-1zM24 30h5v1h-5zM22 31h1v1h-1zM35 31h1v1h-1zM37 31h1v1h-1zM21 32h1v2h-1zM39 33h1v1h-1zM20 34h1v6h-1zM40 34h1v7h-1zM14 37h6v1h-6zM13 38h2v1h-2zM19 38h1v1h-1zM12 39h1v1h-1zM18 39h1v2h-1zM21 39h1v2h-1zM11 40h1v1h-1zM22 40h1v2h-1zM10 41h1v3h-1zM17 41h1v1h-1zM23 41h1v2h-1zM39 41h1v1h-1zM24 42h1v2h-1zM38 42h1v1h-1zM16 43h1v5h-1zM25 43h12v1h-12zM11 44h1v3h-1zM15 44h1v1h-1zM27 44h1v1h-1zM9 45h1v1h-1zM14 45h1v1h-1zM23 45h1v1h-1zM25 45h2v1h-2zM12 46h1v2h-1zM17 46h2v1h-2zM22 46h1v1h-1zM24 46h1v1h-1zM26 46h2v1h-2zM8 47h1v1h-1zM10 47h1v1h-1zM13 47h1v2h-1zM15 47h1v1h-1zM17 47h1v1h-1zM20 47h2v1h-2zM28 47h1v1h-1zM19 48h1v1h-1zM23 48h1v1h-1zM29 48h1v1h-1zM14 49h1v1h-1zM7 50h2v1h-2zM12 50h2v1h-2zM18 50h1v1h-1zM24 50h2v1h-2zM30 50h2v1h-2z"
  />
  <path
    fill="var(--ant-laptop, #3D3D3D)"
    d="M48 38h1v1h-1zM47 39h1v3h-1zM49 39h7v1h-7zM58 39h7v1h-7zM48 40h7v2h-7zM57 40h7v3h-7zM46 42h1v2h-1zM48 42h6v1h-6zM56 42h1v2h-1zM47 43h5v8h-5zM53 43h1v1h-1zM55 43h1v1h-1zM57 43h6v2h-6zM52 44h1v5h-1zM54 44h1v2h-1zM45 45h1v6h-1zM53 45h1v2h-1zM57 45h5v1h-5zM46 46h1v5h-1zM55 46h2v5h-2zM58 46h4v2h-4zM57 47h1v4h-1zM44 48h1v3h-1zM54 48h1v3h-1zM58 48h3v2h-3zM38 49h1v2h-1zM40 49h2v1h-2zM53 49h1v2h-1zM40 50h1v1h-1zM42 51h1v2h-1zM35 52h3v1h-3zM43 52h9v1h-9zM34 54h1v1h-1zM38 54h3v1h-3zM44 55h2v1h-2z"
  />
  <path
    fill="var(--ant-laptop-lit, #595959)"
    d="M49 38h7v1h-7zM58 38h7v1h-7zM48 39h1v1h-1zM57 39h1v1h-1zM56 40h1v2h-1zM47 42h1v1h-1zM55 42h1v1h-1zM46 44h1v2h-1zM56 45h1v1h-1zM54 47h1v1h-1zM39 49h1v1h-1zM41 50h2v1h-2zM43 51h1v1h-1zM59 51h1v1h-1zM39 53h1v1h-1z"
  />
  <path
    fill="var(--ant-ink, #232322)"
    d="M28 36h2v3h-2zM36 36h2v3h-2zM56 39h1v1h-1zM55 40h1v2h-1zM54 42h1v2h-1zM52 43h1v1h-1zM53 44h1v1h-1zM55 44h2v1h-2zM55 45h1v1h-1zM54 46h1v1h-1zM57 46h1v1h-1zM53 47h1v2h-1zM37 49h1v1h-1zM42 49h2v1h-2zM52 49h1v3h-1zM39 50h1v1h-1zM43 50h1v1h-1zM58 50h2v1h-2zM40 51h2v1h-2zM44 51h8v1h-8zM53 51h6v1h-6z"
  />
</svg>

<style>
  /* height: auto — щоб ширина з класу не ламала пропорцію.
     :where() тримає специфічність на нулі: будь-який клас ззовні перекриє. */
  :where(svg) {
    height: auto;

    --ant-sand: #f0d7bb;
    --ant-orange: #ed6d4b;
    --ant-orange-mid: #d75e3f;
    --ant-orange-dark: #bc5740;
    --ant-laptop: #3d3d3d;
    --ant-laptop-lit: #595959;
    --ant-ink: #232322;
  }

  /* На темному тлі корпус ноутбука і сміття зливаються, пісок навпаки світиться. */
  @media (prefers-color-scheme: dark) {
    :where(svg) {
      --ant-sand: #c9b299;
      --ant-laptop: #5d5d5d;
      --ant-laptop-lit: #7d7d7d;
      --ant-ink: #3a3a38;
    }
  }
</style>
