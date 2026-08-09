<script lang="ts">
  let { children } = $props()
</script>

<!--
  Header рендериться в кореневому лейауті (src/routes/+layout.svelte) з
  умовою приховання на /messages і /dashboard.

  Раніше тут був дубль <Header />, який давав ДВА хедери поверх один
  одного: на звичайних сторінках це непомітно, але на /messages кореневий
  лейаут правильно ховав хедер, а цей файл рендерив його знову.

  Панель дашборда сюди не належить — вона живе в
  routes/(auth)/dashboard/+layout.svelte, бо потрібна тільки там.
-->
<main>
  {@render children()}
</main>
