// Контракт клієнт ↔ /api/zunor/chat. Ізоморфний: БЕЗ server-залежностей,
// імпортується і клієнтським чатом, і серверним агентом.
import type { CleaningMetadata } from '$lib/categories/cleaning/title-gen'

export interface ZunorClientMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ZunorDraft {
  /** Структуровані дані заявки — вже пройшли validateCleaningMetadata */
  metadata: CleaningMetadata
  /** Назва від AI (санітизована сервером, з фолбеком на шаблон) */
  title: string
  /** Опис від AI для майстра (санітизований; '' якщо AI не впорався) */
  description: string
  /** Пари для summary-картки: «Помешкання — Квартира» + іконка з describeJob */
  summary: Array<{ label: string; value: string; icon?: string }>
}

export type ZunorResponse =
  | { kind: 'message'; reply: string; suggestions?: string[] }
  | { kind: 'draft'; reply: string; draft: ZunorDraft }
