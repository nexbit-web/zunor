// src/lib/components/toast/index.ts
//
// Бочечка для компонентів тостів.
//   import { Toaster } from '$lib/components/toast'   // у layout
//
// API `toast` живе у сторі (стан окремо від вигляду — як chat):
//   import { toast } from '$lib/stores/toast-store.svelte'

export { default as Toaster } from './toaster.svelte'
