import { json } from '@sveltejs/kit'
import { prisma } from '$lib/prisma'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  const { email, code } = await request.json()

  const otp = await prisma.otpCode.findFirst({ where: { email, code } })
  if (!otp) return json({ error: 'Невірний код' }, { status: 400 })
  if (otp.expiresAt < new Date())
    return json({ error: 'Код застарів' }, { status: 400 })

  await prisma.otpCode.delete({ where: { id: otp.id } })

  return json({ ok: true })
}
