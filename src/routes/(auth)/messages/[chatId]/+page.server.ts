import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { error, redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import type { ChatDetails, ChatMessage } from '$lib/components/chat/types'

const PAGE_SIZE = 50

export const load: PageServerLoad = async ({ params, request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw redirect(302, '/user/login')

  const chatId = params.chatId
  const userId = session.user.id

  const membership = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
    select: {
      lastReadAt: true,
      chat: {
        select: {
          id: true,
          members: {
            select: {
              user: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  avatar: true,
                  role: true,
                  masterProfile: {
                    select: { verificationStatus: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!membership) throw error(404, 'Чат не знайдено')

  const peer = membership.chat.members.find((m) => m.user.id !== userId)?.user
  if (!peer) throw error(404, 'Співрозмовник не знайдено')

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })

  const activeOrder = await prisma.order.findFirst({
    where: {
      chatId,
      status: { in: ['CREATED', 'IN_PROGRESS'] },
    },
    select: { id: true, title: true, status: true },
    orderBy: { updatedAt: 'desc' },
  })

  const messages = await prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      type: true,
      text: true,
      attachmentUrl: true,
      attachmentMimeType: true,
      attachmentSize: true,
      attachmentName: true,
      isRead: true,
      editedAt: true,
      deletedAt: true,
      createdAt: true,
      senderId: true,
      replyToId: true,
      replyTo: {
        select: { id: true, text: true, senderId: true, type: true },
      },
    },
  })

  const hasMore = messages.length > PAGE_SIZE
  const items = hasMore ? messages.slice(0, PAGE_SIZE) : messages
  const nextCursor = hasMore ? items[items.length - 1].id : null

  const initialMessages: ChatMessage[] = items.map((m) => ({
    id: m.id,
    type: m.type,
    text: m.deletedAt ? '' : m.text,
    attachmentUrl: m.deletedAt ? null : m.attachmentUrl,
    attachmentMimeType: m.attachmentMimeType,
    attachmentSize: m.attachmentSize,
    attachmentName: m.attachmentName,
    isRead: m.isRead,
    editedAt: m.editedAt?.toISOString() ?? null,
    deletedAt: m.deletedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    senderId: m.senderId,
    replyToId: m.replyToId,
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          text: m.replyTo.text,
          senderId: m.replyTo.senderId,
          type: m.replyTo.type,
        }
      : null,
  }))

  const chat: ChatDetails = {
    id: membership.chat.id,
    peer: {
      id: peer.id,
      name: peer.name ?? '',
      username: peer.username,
      avatar: peer.avatar,
      isVerified: peer.masterProfile?.verificationStatus === 'VERIFIED',
    },
    members: membership.chat.members.map((m) => ({
      id: m.user.id,
      name: m.user.name ?? '',
      username: m.user.username,
      avatar: m.user.avatar,
      isVerified: m.user.masterProfile?.verificationStatus === 'VERIFIED',
    })),
    myLastReadAt: membership.lastReadAt?.toISOString() ?? null,
    mutedUntil: null,
  }

  return {
    chat,
    initialMessages,
    initialNextCursor: nextCursor,
    currentUserId: userId,
    currentUserRole: me?.role ?? null,
    activeOrder,
  }
}
