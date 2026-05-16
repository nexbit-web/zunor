// // See https://svelte.dev/docs/kit/types#app.d.ts
// // for information about these interfaces
// declare global {
//   namespace App {
//     // interface Error {}
//     // interface Locals {}
//     // interface PageData {}
//     // interface PageState {}
//     // interface Platform {}
//   }
// }

// export {}

// src/app.d.ts
import type { Session } from 'better-auth/types' // або як у better-auth

declare global {
  namespace App {
    interface Locals {
      session?: Session
    }
  }
}

export {}
