<script lang="ts">
  // Усе про вигляд — однією карткою, як «Appearance» у ClickUp (власник
  // дав скриншот): колір акценту, тема й контрастність — рядки «назва й
  // опис ліворуч, вибір праворуч». Зібрано з тих самих блоків, що й решта
  // налаштувань, — власної розмітки розділу тут немає.

  import {
    SettingsGroup,
    SettingsRow,
    ThemePicker,
    AccentPicker,
  } from '$lib/components/settings'
  import { Switch } from '$lib/components/ui/switch/index.js'
  import { appearance } from '$lib/stores/appearance.svelte'
</script>

<SettingsGroup
  title="Оформлення"
  footnote="Вигляд зберігається лише в цьому браузері."
>
  <!-- wide: палітра й мініатюри стають поруч із текстом лише на широкій
       картці, інакше — під ним, на всю ширину. -->
  <SettingsRow
    label="Колір акценту"
    description="Кнопки, посилання й виділення."
    wide
  >
    {#snippet control()}
      <AccentPicker />
    {/snippet}
  </SettingsRow>

  <SettingsRow
    label="Тема"
    description="Світла чи темна — або як налаштовано на пристрої."
    wide
  >
    {#snippet control()}
      <ThemePicker />
    {/snippet}
  </SettingsRow>

  <SettingsRow
    label="Висока контрастність"
    description="Чіткіший текст і рамки."
    for="high-contrast"
  >
    {#snippet control()}
      <!-- checked + onCheckedChange, а не bind:checked: значення живе в
           сторі, який сам пише його в сховище й на <html>. -->
      <Switch
        size="lg"
        id="high-contrast"
        checked={appearance.highContrast}
        onCheckedChange={(on) => appearance.setHighContrast(on)}
      />
    {/snippet}
  </SettingsRow>
</SettingsGroup>
