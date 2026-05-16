// import { BETTER_AUTH_URL } from '$env/static/private'
// import { createAuthClient } from 'better-auth/svelte'

// export const authClient = createAuthClient({
//   baseURL: BETTER_AUTH_URL,
// })

// export const { signIn, signOut, signUp, useSession } = authClient
import { createAuthClient } from 'better-auth/svelte'

export const authClient = createAuthClient()

export const { signIn, signOut, signUp, useSession } = authClient
