<script lang="ts">
  // Верхня смуга діалогу: місто й меню «⋯». Місто — обставина розмови, а не
  // контрол: воно з профілю й не міняється від репліки до репліки, тож
  // живе тут, а не в панелі вводу.
  //
  // Дії, що потрібні рідко (почати заново, скопіювати, звук), сховані в
  // меню: окрема кнопка на кожну з'їдала б смугу й тягнула б погляд від
  // розмови.
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import Ellipsis from '@lucide/svelte/icons/ellipsis'
  import MapPin from '@lucide/svelte/icons/map-pin'
  import SquarePen from '@lucide/svelte/icons/square-pen'
  import Copy from '@lucide/svelte/icons/copy'
  import Volume2 from '@lucide/svelte/icons/volume-2'
  import FileText from '@lucide/svelte/icons/file-text'
  import Settings2 from '@lucide/svelte/icons/settings-2'
  import {
    isMuted,
    loadMutePreference,
    setMuted,
  } from '$lib/sound/notification'

  let {
    city,
    started,
    onreset,
    oncopy,
  }: {
    city: string
    /** Розмова вже йде: є що скидати й копіювати. */
    started: boolean
    onreset: () => void
    oncopy: () => void
  } = $props()

  let sound = $state(true)

  onMount(() => {
    loadMutePreference()
    sound = !isMuted()
  })

  function toggleSound(on: boolean) {
    sound = on
    setMuted(!on)
  }

  const ITEM =
    'cursor-pointer gap-2.5 rounded-xl px-3 py-2 text-[14px] data-highlighted:bg-accent'
</script>

<div
  class="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-end gap-1 px-3 pt-2.5"
>
  <span
    class="flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted-foreground"
  >
    <MapPin size={13} aria-hidden="true" />
    {city}
  </span>

  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      aria-label="Дії з розмовою"
      class="pointer-events-auto flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:bg-accent data-[state=open]:text-foreground"
    >
      <Ellipsis size={18} aria-hidden="true" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content
      align="end"
      sideOffset={6}
      class="w-64 rounded-2xl p-1.5"
    >
      <DropdownMenu.Item class={ITEM} disabled={!started} onSelect={onreset}>
        <SquarePen aria-hidden="true" />
        Нова розмова
      </DropdownMenu.Item>
      <DropdownMenu.Item class={ITEM} disabled={!started} onSelect={oncopy}>
        <Copy aria-hidden="true" />
        Скопіювати розмову
      </DropdownMenu.Item>

      <DropdownMenu.Separator class="mx-2 my-1.5" />

      <!-- Галочку пункту ховаємо: перемикач праворуч показує те саме
           «увімкнено» наочніше, як у налаштуваннях. Прапорець спільний
           зі звуками чату — це одне налаштування, а не два. -->
      <DropdownMenu.CheckboxItem
        class="{ITEM} pr-3 [&_[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden"
        checked={sound}
        onCheckedChange={toggleSound}
        closeOnSelect={false}
      >
        <Volume2 aria-hidden="true" />
        <span class="flex-1">Звуки</span>
        <span
          class={[
            'relative h-4.5 w-8 shrink-0 rounded-full transition-colors',
            sound ? 'bg-primary' : 'bg-muted-foreground/30',
          ]}
          aria-hidden="true"
        >
          <span
            class={[
              'absolute top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-[left]',
              sound ? 'left-4' : 'left-0.5',
            ]}
          ></span>
        </span>
      </DropdownMenu.CheckboxItem>

      <DropdownMenu.Separator class="mx-2 my-1.5" />

      <DropdownMenu.Item
        class={ITEM}
        onSelect={() => goto('/dashboard/settings/assistant')}
      >
        <Settings2 aria-hidden="true" />
        Налаштування асистента
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class={ITEM}
        onSelect={() => goto('/dashboard/jobs/new/manual')}
      >
        <FileText aria-hidden="true" />
        Заповнити форму вручну
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
</div>
