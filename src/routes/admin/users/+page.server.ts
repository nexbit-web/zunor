import { requireStaff } from '$lib/server/admin/guard'
import { prisma } from '$lib/server/prisma'
import type { PageServerLoad } from './$types'

// Пошук людей: за поштою, імʼям чи @handle. Без запиту — останні
// зареєстровані. Стеля — 50 рядків: це пошук, а не вивантаження бази.
export const load: PageServerLoad = async ({ locals, url }) => {
  await requireStaff(locals, 'MANAGER')

  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100)
  const bannedOnly = url.searchParams.get('banned') === '1'

  const users = await prisma.user.findMany({
    where: {
      ...(bannedOnly ? { banned: true, NOT: { banReason: 'account-deleted' } } : {}),
      ...(q.length >= 2
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
              { username: { contains: q.replace(/^@/, ''), mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      banned: true,
      banReason: true,
      createdAt: true,
    },
  })

  return {
    q,
    bannedOnly,
    users: users.map((u) => ({
      ...u,
      deleted: u.banReason === 'account-deleted',
      createdAt: u.createdAt.toISOString(),
    })),
  }
}
