// Картка посилання в повідомленні чату: що записати разом із
// повідомленням і як дописати її пізніше.
//
// Сайт може думати секунди, а повідомлення має зʼявитись одразу. Тому
// роут пише повідомлення з тим, що вже є в кеші, а за невідомою карткою
// йде ПІСЛЯ відповіді (`attachLinkPreview`): дописує її в рядок і шле
// подію `message:preview` обом вкладкам. Процес у нас один і довгоживучий
// (AGENTS.md, 2.1), тож обіцянка після відповіді доживає до кінця.

import { Prisma } from '../../generated/prisma/client'
import { firstLink } from '$lib/components/chat/linkify'
import type { LinkPreview } from '$lib/components/chat/types'
import { cachedLinkPreview, fetchLinkPreview } from '$lib/server/link-preview'
import { prisma } from '$lib/server/prisma'
import { channels, events, safeTrigger } from '$lib/server/pusher'

export interface PlannedPreview {
  /** Що писати в колонку зараз. */
  value: LinkPreview | null
  /** Картки ще немає, але посилання є — по неї треба сходити. */
  fetchLater: boolean
}

/**
 * Картка для тексту: та, що вже лежить у повідомленні (посилання те
 * саме), з кешу, або «сходимо пізніше».
 */
export function planLinkPreview(
  text: string,
  current: LinkPreview | null = null,
): PlannedPreview {
  const link = firstLink(text)
  if (!link) return { value: null, fetchLater: false }
  if (current?.url === link) return { value: current, fetchLater: false }
  const known = cachedLinkPreview(link)
  return { value: known ?? null, fetchLater: known === undefined }
}

/** Значення для Json-колонки: `null` у Prisma пишеться як DbNull. */
export function linkPreviewColumn(
  value: LinkPreview | null,
): LinkPreview | typeof Prisma.DbNull {
  return value ?? Prisma.DbNull
}

/**
 * Сходити по картку й дописати її в повідомлення. Пише лише якщо текст за
 * цей час не змінився і повідомлення не видалили — інакше картка від
 * старого посилання лягла б на новий текст. Ніколи не кидає: кличеться
 * без await.
 */
export async function attachLinkPreview(
  chatId: string,
  messageId: string,
  text: string,
): Promise<void> {
  const link = firstLink(text)
  if (!link) return
  try {
    const linkPreview = await fetchLinkPreview(link)
    if (!linkPreview) return

    const { count } = await prisma.message.updateMany({
      where: { id: messageId, chatId, text, deletedAt: null },
      data: { linkPreview },
    })
    if (!count) return

    await safeTrigger(channels.chat(chatId), events.messagePreview, {
      chatId,
      messageId,
      linkPreview,
    })
  } catch (err) {
    console.error('[link-preview]', err)
  }
}
