<script lang="ts">
  import Sidebar from '$lib/components/dashboard/sidebar.svelte'

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
<!-- <div class="flex min-h-screen  bg-(--dashboard) pt-3 pr-3 pb-3">
  <Sidebar />

  <div class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background">
    <main class="flex-1 ">
      {@render children()}
    </main>
  </div>
</div> -->
<main>
  {@render children()}
</main>
