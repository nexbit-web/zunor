<!-- src/routes/(auth)/+layout.svelte -->
<script lang="ts">
  let { children } = $props()
</script>

<!--
  Header рендериться у root layout (src/routes/+layout.svelte) з
  умовою прихованя на /messages.

  Раніше тут був дубль <Header /> який давав ДВА хедери поверх один
  одного — це непомітно на звичайних сторінках, але на /messages
  root layout правильно ховав хедер, а ЦЕЙ файл його рендерив знову.

  Залишаємо тут тільки <main> для дочірніх роутів.
-->
<main>
  {@render children()}
</main>