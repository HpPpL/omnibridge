import type { Dialog, UnifiedMessage } from '../../core/types.js'
import type { HistoryPage, VkApi } from './api.js'

const OWN_ID = 1000
// Фиксированная база времени — чтобы данные были детерминированными между прогонами.
const BASE_TS = Math.floor(Date.parse('2026-06-01T12:00:00Z') / 1000)

interface MockDialog {
  peerId: number
  type: Dialog['peerType']
  title: string
  count: number
}

const MOCK_DIALOGS: MockDialog[] = [
  { peerId: 2001, type: 'user', title: 'Анна Петрова', count: 7 },
  { peerId: 2002, type: 'user', title: 'Иван Сидоров', count: 3 },
  { peerId: 2000000001, type: 'chat', title: 'Рабочий чат', count: 12 },
]

/** Источник-заглушка: те же интерфейсы, что у реального клиента, но без сети и токена. */
export class MockVkClient implements VkApi {
  async getOwnId(): Promise<number> {
    return OWN_ID
  }

  async getConversations(accountId: string): Promise<{ dialogs: Dialog[]; total: number }> {
    const dialogs = MOCK_DIALOGS.map<Dialog>((d) => ({
      accountId,
      dialogId: String(d.peerId),
      peerType: d.type,
      title: d.title,
      unread: 0,
      lastMessageId: String(d.peerId * 100000 + d.count),
    }))
    return { dialogs, total: dialogs.length }
  }

  async getHistory(
    accountId: string,
    dialogId: string,
    opts: { offset: number; count: number },
  ): Promise<HistoryPage> {
    const d = MOCK_DIALOGS.find((x) => String(x.peerId) === dialogId)
    if (!d) return { messages: [], total: 0 }
    const all = buildMessages(accountId, d) // новые первыми, как у VK
    const messages = all.slice(opts.offset, opts.offset + opts.count)
    return { messages, total: d.count }
  }
}

function buildMessages(accountId: string, d: MockDialog): UnifiedMessage[] {
  const messages: UnifiedMessage[] = []
  for (let seq = d.count; seq >= 1; seq--) {
    const out = seq % 2 === 0
    messages.push({
      id: String(d.peerId * 100000 + seq),
      source: 'vk',
      sourceNodeId: accountId,
      accountId,
      dialogId: String(d.peerId),
      dialogTitle: d.title,
      direction: out ? 'out' : 'in',
      author: { id: out ? String(OWN_ID) : String(d.peerId), name: out ? 'Я' : d.title },
      text: `Сообщение ${seq} в «${d.title}»`,
      attachments: seq % 4 === 0 ? [{ type: 'photo' }] : [],
      receivedAt: new Date((BASE_TS - (d.count - seq) * 60) * 1000).toISOString(),
    })
  }
  return messages
}
