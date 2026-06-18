import type { Dialog, UnifiedMessage } from '../../core/types.js'
import { VkClient } from './client.js'
import { MockVkClient } from './mock.js'

export interface HistoryPage {
  messages: UnifiedMessage[]
  total: number
}

/**
 * Минимальный контракт источника VK, нужный discovery и бэкфиллу. Реализуют
 * реальный `VkClient` (по токену) и `MockVkClient` (фейковые данные).
 */
export interface VkApi {
  getOwnId(): Promise<number>
  getConversations(
    accountId: string,
    opts?: { count?: number; offset?: number },
  ): Promise<{ dialogs: Dialog[]; total: number }>
  getHistory(
    accountId: string,
    dialogId: string,
    opts: { offset: number; count: number },
  ): Promise<HistoryPage>
}

/** Выбирает источник: мок (VK_MOCK=1) или реальный клиент по VK_USER_TOKEN. */
export function createVkClient(): VkApi {
  if (process.env.VK_MOCK === '1') return new MockVkClient()
  const token = process.env.VK_USER_TOKEN
  if (!token) {
    throw new Error('Не задан VK_USER_TOKEN. Для отладки без токена включи VK_MOCK=1.')
  }
  return new VkClient(token)
}
