<!--
  src/lib/components/chat/header-typing.svelte

  Невелика анімація «друкує...» для відображення в шапці чата
  поряд з ім'ям співрозмовника, як у Telegram Web.
-->
<script lang="ts">
  // Без props — просто візуальний компонент
</script>

<span class="header-typing">
  <span class="header-typing-text">друкує</span>
  <span class="header-typing-dots">
    <span class="dot" style="--d: 0s"></span>
    <span class="dot" style="--d: 0.16s"></span>
    <span class="dot" style="--d: 0.32s"></span>
  </span>
</span>

<style>
  .header-typing {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    line-height: 1.2;
    color: var(--primary);
    font-weight: 500;
  }

  .header-typing-text {
    letter-spacing: 0.02em;
  }

  .header-typing-dots {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    margin-left: 1px;
    height: 12px;
    padding-bottom: 2px;
  }

  .dot {
    display: inline-block;
    width: 3px;
    height: 3px;
    border-radius: 9999px;
    background-color: var(--primary);
    animation: typingBounce 1.2s infinite ease-in-out;
    animation-delay: var(--d);
  }

  @keyframes typingBounce {
    0%,
    60%,
    100% {
      transform: translateY(0);
      opacity: 0.45;
    }
    30% {
      transform: translateY(-3px);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none;
    }
  }
</style>
