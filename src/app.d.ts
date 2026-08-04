import type { Session, User } from '$lib/server/auth'
import type { Role } from './generated/prisma/client'

declare global {
  namespace App {
    /** Стан акаунта з БД, вже прочитаний у guardHandle. */
    interface AccountState {
      id: string
      role: Role
      onboarded: boolean
      emailVerified: boolean
    }

    interface Locals {
      session: Session | null
      user: User | null
      /** Заповнений лише на сторінках, де guard читав БД (усе /dashboard). */
      account: AccountState | null
    }
  }
}
export {}
