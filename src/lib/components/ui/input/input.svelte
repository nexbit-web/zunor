<script lang="ts">
  import { cn, type WithElementRef } from '$lib/utils.js'
  import type {
    HTMLInputAttributes,
    HTMLInputTypeAttribute,
  } from 'svelte/elements'
  import type { User } from 'lucide-svelte'

  type InputType = Exclude<HTMLInputTypeAttribute, 'file'>

  type Props = WithElementRef<
    Omit<HTMLInputAttributes, 'type'> &
      (
        | { type: 'file'; files?: FileList }
        | { type?: InputType; files?: undefined }
      )
  > & {
    /** Іконка ліворуч у полі (як у ClickUp): що саме сюди вводять. */
    icon?: typeof User
    /**
     * Незмінна частина значення перед текстом — «+380» у телефоні. Стоїть
     * у самому полі, але не входить у value: стерти її не можна, і в
     * обробник приходить лише те, що ввела людина.
     */
    prefixText?: string
  }

  let {
    ref = $bindable(null),
    value = $bindable(),
    type,
    files = $bindable(),
    class: className,
    'data-slot': dataSlot = 'input',
    icon: Icon,
    prefixText,
    ...restProps
  }: Props = $props()

  // Спільний вигляд поля. Заокруглення 10px — на крок більше за кнопки
  // (8px): поле — це «віконце», кнопка — дія, і так їх легше розрізнити.
  const base =
    'h-9 rounded-[10px] border border-input bg-field px-2.5 py-1 text-base shadow-xs transition-[color,box-shadow] file:h-7 file:text-sm file:font-medium focus-visible:border-ring focus-visible:shadow-[0_0_0_1px_var(--color-ring)] aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:shadow-[0_0_0_1px_var(--color-destructive)] aria-invalid:border-destructive md:text-sm dark:aria-invalid:border-destructive/50 w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50'

  // Відступ тексту від лівого краю, коли перед ним іконка та/або префікс.
  // Префікс міряємо в ch від шрифту самого поля (цифри — tabular-nums,
  // тобто рівно 1ch кожна): ширину «+380» не треба підбирати руками під
  // кожен кегль.
  const leadStyle = $derived(
    prefixText
      ? `padding-left: calc(${Icon ? '2.25rem' : '0.625rem'} + ${prefixText.length}ch + 0.3rem)`
      : undefined,
  )
</script>

{#if type === 'file'}
  <input
    bind:this={ref}
    data-slot={dataSlot}
    class={cn(base, className)}
    type="file"
    bind:files
    bind:value
    {...restProps}
  />
{:else if Icon || prefixText}
  <!-- Обгортка лише позиціонує іконку й префікс; рамка, фокус і
       червоний стан лишаються на самому <input>, як і в простого поля. -->
  <div class="relative w-full min-w-0">
    {#if Icon}
      <Icon
        class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    {/if}
    {#if prefixText}
      <span
        class="pointer-events-none absolute top-1/2 -translate-y-1/2 text-base text-foreground tabular-nums select-none md:text-sm {Icon
          ? 'left-9'
          : 'left-2.5'}"
        aria-hidden="true"
      >
        {prefixText}
      </span>
    {/if}
    <input
      bind:this={ref}
      data-slot={dataSlot}
      class={cn(base, Icon && 'pl-9', prefixText && 'tabular-nums', className)}
      style={leadStyle}
      {type}
      bind:value
      {...restProps}
    />
  </div>
{:else}
  <input
    bind:this={ref}
    data-slot={dataSlot}
    class={cn(base, className)}
    {type}
    bind:value
    {...restProps}
  />
{/if}
