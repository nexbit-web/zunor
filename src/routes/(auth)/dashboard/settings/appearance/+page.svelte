<script lang="ts">
  // Розділ зібраний із тих самих блоків, що й решта налаштувань:
  // власної розмітки картки тут більше немає.

  import {
    SettingsGroup,
    SettingsBlock,
    ThemePicker,
  } from '$lib/components/settings'
</script>

<SettingsGroup
  title="Тема"
  footnote="«Системна» підлаштовується під налаштування пристрою. Вибір зберігається в цьому браузері — на іншому пристрої тему треба обрати заново."
>
  <!-- Блок, а не рядок: вибір теми — це не «підпис ліворуч, контрол
       праворуч», а три картки на всю ширину. -->
  <SettingsBlock roomy>
    <ThemePicker />
  </SettingsBlock>
</SettingsGroup>
