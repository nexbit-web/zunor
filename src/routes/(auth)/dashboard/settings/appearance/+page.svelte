<script lang="ts">
  // Усе про вигляд — в одному розділі, як у ClickUp: колір акценту,
  // тема й контрастність. Зібрано з тих самих блоків, що й решта
  // налаштувань, — власної розмітки розділу тут немає.

  import {
    SettingsGroup,
    SettingsBlock,
    SettingsRow,
    ThemePicker,
    AccentPicker,
  } from '$lib/components/settings'
  import { Switch } from '$lib/components/ui/switch/index.js'
  import { appearance } from '$lib/stores/appearance.svelte'
</script>

<SettingsGroup title="Колір акценту">
  <SettingsBlock>
    <AccentPicker />
  </SettingsBlock>
</SettingsGroup>

<SettingsGroup title="Тема">
  <!-- Блок, а не рядок: вибір теми — це не «підпис ліворуч, контрол
       праворуч», а три мініатюри на всю ширину. -->
  <SettingsBlock>
    <ThemePicker />
  </SettingsBlock>
</SettingsGroup>

<SettingsGroup
  title="Контрастність"
  footnote="Вигляд зберігається лише в цьому браузері."
>
  <SettingsRow
    label="Висока контрастність"
    description="Чіткіший текст і рамки."
    for="high-contrast"
  >
    {#snippet control()}
      <!-- checked + onCheckedChange, а не bind:checked: значення живе в
           сторі, який сам пише його в сховище й на <html>. -->
      <Switch
        id="high-contrast"
        checked={appearance.highContrast}
        onCheckedChange={(on) => appearance.setHighContrast(on)}
      />
    {/snippet}
  </SettingsRow>
</SettingsGroup>
