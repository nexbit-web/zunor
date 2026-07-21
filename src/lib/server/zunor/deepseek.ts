// src/lib/server/zunor/deepseek.ts
//
// Мінімальний клієнт DeepSeek chat/completions (OpenAI-сумісний формат).
// Без SDK: одна залежність менше, повний контроль над таймаутом і помилками.
// ⚠️ deepseek-chat / deepseek-reasoner видаляються 2026-07-24 — тому v4.
import { DEEPSEEK_API_KEY } from '$env/static/private'

const BASE_URL = 'https://api.deepseek.com'
export const ZUNOR_MODEL = 'deepseek-v4-flash' // швидка й дешева — для чату оптимум

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

const TIMEOUT_MS = 30_000

export async function chatCompletion(
  messages: DsMessage[],
  tools: DsTool[],
): Promise<DsResponse> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: ZUNOR_MODEL,
      messages,
      tools,
      temperature: 0.7,
      max_tokens: 600, // стеля витрат: відповіді агента короткі за визначенням
      stream: false,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  if (!res.ok) {
    // Деталі — в лог; юзеру згодом піде generic 502 без внутрішньої інформації
    const detail = await res.text().catch(() => '')
    console.error('[zunor] deepseek error', res.status, detail.slice(0, 500))
    throw new Error(`DeepSeek ${res.status}`)
  }

  const data = (await res.json()) as DsResponse
  if (data.usage) console.log('[zunor] tokens:', data.usage.total_tokens)
  return data
}
