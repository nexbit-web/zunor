// Заглушки зовнішньої інфраструктури: Pusher, Cloudinary, сповіщення,
// диспетчер, планувальник хвиль.
//
// Жоден тест не має права піти в мережу — інакше набір стає повільним,
// нестабільним і залежним від чужих сервісів. Тут же видно, чи роут узагалі
// покликав те, що обіцяв: safeTrigger.mock.calls показує broadcast, який
// інакше довелося б перевіряти очима.
//
// Імена каналів і подій НЕ дублюються з реального модуля навмисно: тести
// звіряються з рядками-літералами ('message:new'), бо саме вони — контракт
// із фронтендом. Мок, що переспівує реалізацію, такий розсинхрон пропустив
// би (це вже ставалося: 'notification' проти 'notification:new').

import { vi } from 'vitest'

// ─── $lib/server/pusher ───

// Параметри в моках прописані навмисно: без них mock.calls типізується як
// порожній кортеж, і тест не може перевірити, З ЧИМ саме викликали функцію.
export const safeTrigger = vi.fn(
  async (_channel: string | string[], _event: string, _data: unknown) => {},
)

export const pusherServer = {
  trigger: vi.fn(
    async (_channel: string | string[], _event: string, _data: unknown) => {},
  ),
  authorizeChannel: vi.fn(
    (_socketId: string, _channel: string, _presenceData?: unknown) => ({
      auth: 'test-app:test-signature',
    }),
  ),
}

export const channels = {
  chat: (chatId: string) => `private-chat-${chatId}`,
  user: (userId: string) => `private-user-${userId}`,
  presence: (chatId: string) => `presence-chat-${chatId}`,
  admin: 'private-admin',
}

export const events = {
  messageNew: 'message:new',
  messageEdit: 'message:edit',
  messageDelete: 'message:delete',
  messageRead: 'message:read',
  chatUpdate: 'chat:update',
  orderStatus: 'order:status',
  typing: 'client-typing',
  moderationNew: 'moderation:new',
} as const

// ─── $lib/server/notifications ───

export const Notify = {
  newProposal: vi.fn(async () => {}),
  proposalAccepted: vi.fn(async () => {}),
  orderStarted: vi.fn(async () => {}),
  orderCompleted: vi.fn(async () => {}),
  orderCancelled: vi.fn(async () => {}),
  jobReopened: vi.fn(async () => {}),
}

export const notify = vi.fn(async () => {})

// ─── $lib/server/dispatch ───
// Мок усього публічного API мозку: роути імпортують лише з index.ts.
// Конфіг — справжній: це числа, а не інфраструктура. Береться з підмодулів,
// а не з бареля: цей файл і є моком бареля, і імпорт із нього замкнувся б.

export { DISPATCH_CONFIG } from '$lib/server/dispatch/config'
export { WAVES_DONE_MIN } from '$lib/server/dispatch/core/waves'

export const startWaves = vi.fn(
  async (_job: { id: string; createdAt: Date }) => {},
)
export const resumeDispatch = vi.fn(async () => ({ checked: 0, caughtUp: 0 }))
export const markOpened = vi.fn(async () => {})
export const markResponded = vi.fn(async () => {})
export const cancelWaves = vi.fn()
export const scheduledCount = vi.fn(() => 0)
export const recommendForJob = vi.fn(async () => ({
  recommended: new Set<string>(),
  newbies: new Set<string>(),
}))
export const masterFeedScope = vi.fn(async () => ({
  declinedIds: [] as string[],
  where: [],
}))

// ─── $lib/server/cloudinary ───

export const cloudinary = {
  uploader: {
    destroy: vi.fn(async () => ({ result: 'ok' })),
  },
}

export const signUploadParams = vi.fn(
  (_params: { folder: string; resourceType?: string; publicId?: string }) => ({
    signature: 'test-signature',
    timestamp: 1_700_000_000,
    apiKey: 'test-key',
    cloudName: 'test-cloud',
  }),
)

/** Викликати в beforeEach разом із resetPrisma. */
export function resetInfra(): void {
  for (const fn of [
    safeTrigger,
    pusherServer.trigger,
    pusherServer.authorizeChannel,
    notify,
    startWaves,
    resumeDispatch,
    markOpened,
    markResponded,
    cancelWaves,
    scheduledCount,
    recommendForJob,
    masterFeedScope,
    cloudinary.uploader.destroy,
    signUploadParams,
    ...Object.values(Notify),
  ]) {
    fn.mockClear()
  }
}
