import { DEEPSEEK_API_KEY } from '$env/static/private'
import { turnLog } from './turn-log'

const BASE_URL = 'https://api.deepseek.com'
export const ZUNOR_MODEL = 'deepseek-v4-flash'

export type DsRole = 'system' | 'user' | 'assistant' | 'tool'

export interface DsToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface DsMessage {
  role: DsRole
  content: string | null
  tool_calls?: DsToolCall[]
  tool_call_id?: string
}

export interface DsTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

interface DsResponse {
  choices: Array<{
    message: {
      role: 'assistant'
      content: string | null
      tool_calls?: DsToolCall[]
    }
    finish_reason: string
  }>
  usage?: { total_tokens: number }
}

// ─── Таймаути ───
// Синхронний виклик: жорсткий дедлайн на ВЕСЬ запит — коректно, бо стріму
// немає. 60s: thinking-запити думають 15–20s перед відповіддю.
const SYNC_TIMEOUT_MS = 60_000
// Стрім: жорсткий таймаут ЛИШЕ на встановлення зʼєднання (до перших байтів).
const CONNECT_TIMEOUT_MS = 30_000
// Стрім: idle-таймаут МІЖ чанками; перезаводиться на кожному чанку.
const IDLE_TIMEOUT_MS = 20_000

const COMMON_BODY = {
  model: ZUNOR_MODEL,
  temperature: 0.3, // діє ЛИШЕ в non-thinking режимі (док: у thinking ігнорується)
  max_tokens: 4000, // стеля, не витрата; у thinking звідси ж ідуть reasoning-токени
}

// ─── Режим thinking (док: /guides/thinking_mode) ───
// Дефолт у v4 — enabled, тому ЗАВЖДИ задаємо явно.
//   enabled  — точніший розбір складних входів (простині з багатьма фактами,
//              драфти), але 15–20s до перших слів.
//   disabled — швидкі короткі ходи (~2s), поведінка старого deepseek-chat.
// ⚠️ Обмеження thinking-режиму з doc, які МАЄ памʼятати той, хто викликає:
//   1) temperature ігнорується;
//   2) якщо thinking-хід зробив tool_call, у наступних запитах того ж ланцюга
//      треба повертати reasoning_content, інакше API поверне 400 —
//      тому ретраї resolveDraft ідуть із thinking=false.
function thinkingBody(thinking: boolean) {
  return { thinking: { type: thinking ? 'enabled' : 'disabled' } }
}

// ─── Синхронний виклик (драфтові раунди) ───
export async function chatCompletion(
  messages: DsMessage[],
  tools: DsTool[],
  thinking = false,
): Promise<DsResponse> {
  turnLog().request('sync', messages, thinking)
  const t0 = Date.now()

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      ...COMMON_BODY,
      ...thinkingBody(thinking),
      messages,
      tools,
      stream: false,
    }),
    signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[zunor] deepseek error', res.status, detail.slice(0, 500))
    turnLog().note(`DeepSeek ${res.status}: ${detail.slice(0, 300)}`)
    throw new Error(`DeepSeek ${res.status}`)
  }

  const data = (await res.json()) as DsResponse
  if (data.usage) console.log('[zunor] tokens:', data.usage.total_tokens)

  const choice = data.choices[0]
  const call = choice?.message.tool_calls?.[0]
  turnLog().response({
    text: choice?.message.content ?? '',
    toolCall: call
      ? { name: call.function.name, arguments: call.function.arguments }
      : null,
    finishReason: choice?.finish_reason ?? null,
    tokens: data.usage?.total_tokens,
    ms: Date.now() - t0,
  })

  return data
}

// ─── Стрімовий виклик ───
export interface StreamResult {
  content: string
  toolCall: DsToolCall | null
  finishReason: string | null
}

export type StreamChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool_start' }

interface RawDelta {
  content?: string | null
  tool_calls?: Array<{
    index: number
    id?: string
    function?: { name?: string; arguments?: string }
  }>
}

export async function* chatCompletionStream(
  messages: DsMessage[],
  tools: DsTool[],
  thinking = false,
): AsyncGenerator<StreamChunk, StreamResult, void> {
  turnLog().request('stream', messages, thinking)
  const t0 = Date.now()

  const ac = new AbortController()
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => ac.abort(), IDLE_TIMEOUT_MS)
  }
  const connectTimer = setTimeout(() => ac.abort(), CONNECT_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        ...COMMON_BODY,
        ...thinkingBody(thinking),
        messages,
        tools,
        stream: true,
      }),
      signal: ac.signal,
    })
  } finally {
    clearTimeout(connectTimer)
  }

  if (!res.ok || !res.body) {
    const detail = res.body ? await res.text().catch(() => '') : ''
    console.error(
      '[zunor] deepseek stream error',
      res.status,
      detail.slice(0, 500),
    )
    turnLog().note(`DeepSeek stream ${res.status}: ${detail.slice(0, 300)}`)
    throw new Error(`DeepSeek ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  let content = ''
  let toolId = ''
  let toolName = ''
  let toolArgs = ''
  let toolStarted = false
  let finishReason: string | null = null

  try {
    armIdle()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      armIdle() // чанк прийшов → перезаводимо idle-таймер

      buffer += decoder.decode(value, { stream: true })

      // SSE: події розділені \n\n, кожен рядок «data: {...}»
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? '' // хвіст без \n\n лишаємо на наступний тік

      for (const event of events) {
        const line = event.trim()
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') continue

        let parsed: {
          choices?: Array<{ delta?: RawDelta; finish_reason?: string | null }>
        }
        try {
          parsed = JSON.parse(payload)
        } catch {
          continue // битий шматок — пропускаємо, наступні події дійдуть цілими
        }

        const choice = parsed.choices?.[0]
        if (!choice) continue
        if (choice.finish_reason) finishReason = choice.finish_reason

        const delta = choice.delta
        if (!delta) continue

        // Дельта tool_call → з цієї миті це драфт, текст клієнту більше не шлемо
        if (delta.tool_calls?.length) {
          if (!toolStarted) {
            toolStarted = true
            yield { type: 'tool_start' }
          }
          const tc = delta.tool_calls[0]
          if (tc.id) toolId = tc.id
          if (tc.function?.name) toolName = tc.function.name
          if (tc.function?.arguments) toolArgs += tc.function.arguments
          continue
        }

        // Звичайний текст. Стрімимо клієнту ЛИШЕ поки не почався tool_call.
        if (delta.content) {
          content += delta.content
          if (!toolStarted) yield { type: 'text', delta: delta.content }
        }
      }
    }
  } catch (err) {
    // Обрив/таймаут посеред стріму: фіксуємо в лог те, що встигли зібрати,
    // і кидаємо далі — обробка обриву лишається в agent.ts.
    turnLog().note(`Стрім обірвався: ${String(err)}`)
    turnLog().response({
      text: content,
      toolCall: toolName ? { name: toolName, arguments: toolArgs } : null,
      finishReason,
      ms: Date.now() - t0,
    })
    throw err
  } finally {
    if (idleTimer) clearTimeout(idleTimer)
    reader.releaseLock()
  }

  const toolCall: DsToolCall | null = toolName
    ? {
        id: toolId || 'call_0',
        type: 'function',
        function: { name: toolName, arguments: toolArgs },
      }
    : null

  turnLog().response({
    text: content,
    toolCall: toolCall
      ? { name: toolCall.function.name, arguments: toolCall.function.arguments }
      : null,
    finishReason,
    ms: Date.now() - t0,
  })

  return { content, toolCall, finishReason }
}
