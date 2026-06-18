import type { Dialog, PeerType } from '../../core/types.js'

const API = 'https://api.vk.com/method'
const DEFAULT_VERSION = '5.199'

/** Ошибка VK API с кодом — чтобы выше можно было различать (напр. 5 = токен). */
export class VkApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(`VK API (${code}): ${message}`)
    this.name = 'VkApiError'
  }
}

interface VkProfile {
  id: number
  first_name: string
  last_name: string
}
interface VkGroup {
  id: number
  name: string
}
interface VkConversationItem {
  conversation: {
    peer: { id: number; type: PeerType }
    unread_count?: number
    chat_settings?: { title?: string }
    last_message_id?: number
  }
}
interface ConversationsResponse {
  count: number
  items: VkConversationItem[]
  profiles?: VkProfile[]
  groups?: VkGroup[]
}

/** Сырое сообщение истории VK (минимально нужные поля). */
export interface VkHistoryMessage {
  id: number
  from_id: number
  peer_id: number
  text: string
  date: number
  out?: number
  reply_message?: { id?: number }
  attachments?: Array<{ type: string }>
}

/**
 * Тонкий клиент VK для личного аккаунта по user-токену. Знает только про
 * HTTP/формат VK; доменную логику (что выгружать) держит вызывающий код.
 */
export class VkClient {
  constructor(
    private readonly token: string,
    private readonly version = DEFAULT_VERSION,
  ) {}

  async api<T>(method: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(`${API}/${method}`)
    const search = new URLSearchParams({ access_token: this.token, v: this.version })
    for (const [k, v] of Object.entries(params)) search.set(k, String(v))
    url.search = search.toString()

    const res = await fetch(url)
    const json = (await res.json()) as {
      response?: T
      error?: { error_code: number; error_msg: string }
    }
    if (json.error) throw new VkApiError(json.error.error_code, json.error.error_msg)
    if (json.response === undefined) throw new Error(`VK API ${method}: пустой ответ`)
    return json.response
  }

  /** id текущего аккаунта (для accountId вида 'vk:<id>'). */
  async getOwnId(): Promise<number> {
    const users = await this.api<Array<{ id: number }>>('users.get')
    return users[0]?.id ?? 0
  }

  /** Страница диалогов, приведённая к доменному Dialog. */
  async getConversations(
    accountId: string,
    opts: { count?: number; offset?: number } = {},
  ): Promise<{ dialogs: Dialog[]; total: number }> {
    const r = await this.api<ConversationsResponse>('messages.getConversations', {
      count: opts.count ?? 50,
      offset: opts.offset ?? 0,
      extended: 1,
      fields: 'first_name,last_name',
    })

    const profiles = new Map((r.profiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()]))
    const groups = new Map((r.groups ?? []).map((g) => [g.id, g.name]))

    const dialogs = r.items.map<Dialog>((item) => {
      const { peer, unread_count, chat_settings, last_message_id } = item.conversation
      return {
        accountId,
        dialogId: String(peer.id),
        peerType: peer.type,
        title: resolveTitle(peer.type, peer.id, chat_settings?.title, profiles, groups),
        unread: unread_count ?? 0,
        lastMessageId: last_message_id ? String(last_message_id) : undefined,
      }
    })
    return { dialogs, total: r.count }
  }
}

function resolveTitle(
  type: PeerType,
  peerId: number,
  chatTitle: string | undefined,
  profiles: Map<number, string>,
  groups: Map<number, string>,
): string {
  if (type === 'chat') return chatTitle ?? `Беседа ${peerId}`
  if (type === 'group') return groups.get(Math.abs(peerId)) ?? `Сообщество ${peerId}`
  return profiles.get(peerId) ?? `Пользователь ${peerId}`
}
