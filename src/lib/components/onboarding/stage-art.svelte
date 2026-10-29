<!--
  Ілюстрації етапів онбордингу майстра — для заставок і огляду.

  Не стокові картинки, а шматочки самого Zunor: картка профілю, плитки
  послуг тими самими іконками, що в заявках, профіль очима клієнта. Людина
  одразу бачить, ЩО саме зараз складе, — і все на токенах теми, тож
  темна тема й акцентний колір працюють без окремих зображень.

  size="sm" — мініатюра 72px для огляду етапів: одна впізнавана деталь.
-->
<script lang="ts">
  import ServiceIcon from '$lib/categories/cleaning/service-icon.svelte'
  import UserIcon from '@lucide/svelte/icons/user'
  import LockIcon from '@lucide/svelte/icons/lock'
  import MapPinIcon from '@lucide/svelte/icons/map-pin'
  import CarIcon from '@lucide/svelte/icons/car'
  import StarIcon from '@lucide/svelte/icons/star'
  import BadgeCheckIcon from '@lucide/svelte/icons/badge-check'

  let { kind, size = 'lg' }: { kind: string; size?: 'lg' | 'sm' } = $props()

  const WORK = [
    'standard',
    'deep',
    'post-renovation',
    'windows',
    'sofa',
    'regular',
  ]
  const PICKED = ['deep', 'windows']
</script>

{#if size === 'sm'}
  <div
    class="relative grid size-18 shrink-0 place-items-center overflow-hidden rounded-2xl bg-muted"
    aria-hidden="true"
  >
    {#if kind === 'you'}
      <span
        class="grid size-11 place-items-center rounded-full bg-primary/15 text-primary"
      >
        <UserIcon class="size-6" />
      </span>
    {:else if kind === 'work'}
      <div class="grid grid-cols-2 gap-1">
        {#each ['deep', 'windows', 'sofa', 'post-renovation'] as s (s)}
          <span
            class="grid size-7 place-items-center rounded-lg bg-background text-foreground/80"
          >
            <ServiceIcon service={s} class="size-5" />
          </span>
        {/each}
      </div>
    {:else}
      <span class="flex items-center gap-1 text-[15px] font-semibold">
        <StarIcon class="size-4.5 fill-amber-400 text-amber-400" />
        4.9
      </span>
    {/if}
  </div>
{:else}
  <div class="art" aria-hidden="true">
    {#if kind === 'you'}
      <!-- Картка майстра в момент заповнення: імʼя, фото, телефон під
           замком — він відкриється лише після угоди. -->
      <div class="card back"></div>
      <div class="card front">
        <div class="flex items-center gap-4">
          <span
            class="grid size-16 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"
          >
            <UserIcon class="size-8" />
          </span>
          <div class="min-w-0 flex-1 space-y-2">
            <div class="h-3.5 w-32 rounded-full bg-foreground/80"></div>
            <div class="h-2.5 w-20 rounded-full bg-foreground/20"></div>
          </div>
        </div>
        <div class="mt-6 space-y-2.5">
          <div class="h-2.5 w-full rounded-full bg-foreground/10"></div>
          <div class="h-2.5 w-4/5 rounded-full bg-foreground/10"></div>
        </div>
        <div
          class="mt-6 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-[12.5px] text-muted-foreground"
        >
          <LockIcon class="size-3.5" />
          +380 •• ••• •• 67 — після угоди
        </div>
      </div>
    {:else if kind === 'work'}
      <!-- Що майстер бере: плитки послуг тими самими іконками, що в
           заявках, і дві відповіді, з яких рахується дорога. -->
      <div class="card back"></div>
      <div class="card front">
        <div class="grid grid-cols-3 gap-2.5">
          {#each WORK as s (s)}
            {@const on = PICKED.includes(s)}
            <span
              class={[
                'grid aspect-square place-items-center rounded-xl text-foreground/80',
                on ? 'bg-muted/60 ring-1 ring-primary' : 'bg-muted/60',
              ]}
            >
              <ServiceIcon service={s} class="size-8" />
            </span>
          {/each}
        </div>
        <div class="mt-5 flex flex-wrap gap-2">
          <span class="chip"
            ><MapPinIcon class="size-3.5" /> Центр · до 10 км</span
          >
          <span class="chip"><CarIcon class="size-3.5" /> Своїм авто</span>
        </div>
      </div>
    {:else}
      <!-- Профіль очима клієнта: оцінка, позначка перевірки, роботи. -->
      <div class="card back"></div>
      <div class="card front">
        <div class="flex items-center gap-3.5">
          <span
            class="grid size-12 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"
          >
            <UserIcon class="size-6" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <div class="h-3 w-24 rounded-full bg-foreground/80"></div>
              <BadgeCheckIcon class="size-4 text-primary" />
            </div>
            <div class="mt-2 flex items-center gap-1 text-[13px] font-semibold">
              <StarIcon class="size-3.5 fill-amber-400 text-amber-400" />
              4.9
              <span class="font-normal text-muted-foreground">· 32 відгуки</span
              >
            </div>
          </div>
        </div>
        <div class="mt-5 grid grid-cols-3 gap-2">
          <span class="thumb t1"></span>
          <span class="thumb t2"></span>
          <span class="thumb t3"></span>
        </div>
        <div class="mt-5 space-y-2">
          <div class="h-2.5 w-full rounded-full bg-foreground/10"></div>
          <div class="h-2.5 w-3/5 rounded-full bg-foreground/10"></div>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .art {
    position: relative;
    width: min(100%, 360px);
    aspect-ratio: 1 / 0.92;
    margin-inline: auto;
  }

  /* Дві картки стосом: задня трохи повернута — сцена, а не скриншот.
     Тінь тут єдина на всю анкету, тож вона читається як «підняте». */
  .card {
    position: absolute;
    inset: 8% 4%;
    border-radius: 24px;
    background: var(--card);
  }

  .card.back {
    background: var(--muted);
    transform: rotate(-5deg) translate(-4%, 3%);
  }

  .card.front {
    padding: 28px;
    border: 1px solid var(--border);
    box-shadow:
      0 24px 48px -20px rgb(0 0 0 / 0.22),
      0 4px 12px -4px rgb(0 0 0 / 0.08);
    transform: rotate(1.5deg);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 9999px;
    background: var(--muted);
    color: var(--muted-foreground);
    font-size: 12.5px;
  }

  .thumb {
    aspect-ratio: 1;
    border-radius: 12px;
  }

  /* «Фото до/після» — тонований колір акценту, без картинок. */
  .t1 {
    background: color-mix(in srgb, var(--primary) 22%, var(--muted));
  }
  .t2 {
    background: color-mix(in srgb, var(--primary) 12%, var(--muted));
  }
  .t3 {
    background: color-mix(in srgb, var(--foreground) 10%, var(--muted));
  }

  @media (prefers-reduced-motion: no-preference) {
    .card.front {
      animation: settle 600ms cubic-bezier(0.33, 1, 0.68, 1) both;
    }
    @keyframes settle {
      from {
        transform: rotate(0deg) translateY(12px);
        opacity: 0;
      }
    }
  }
</style>
