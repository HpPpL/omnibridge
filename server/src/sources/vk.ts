import type { Source, MessageHandler } from './base.js'
import type { UnifiedMessage } from '../core/types.js'

const API = 'https://api.vk.com/method'
const API_VERSION = '5.199'

export interface VkSourceOptions {
  id: string
  groupId: string
  token: string
}

/** Long Poll-сервер сообщества: куда ходить за обновлениями. */
interface LongPollServer {
  server: string
  key: string
  ts: string
}

/**
 * Источник ВКонтакте на Bots Long Poll API.
 * Документация: getLongPollServer → крутим a_check, ловим события message_new.
 */
export class VkSource implements Source {
  readonly id: string
  private readonly groupId: string
  private readonly token: string
  private running = false

  constructor(opts: VkSourceOptions) {
    this.id = opts.id
    this.groupId = opts.groupId
    this.token = opts.token
  }

  async start(onMessage: MessageHandler): Promise<void> {
    this.running = true
    let lp: LongPollServer | null = null

    while (this.running) {
      try {
        if (!lp) {
          lp = await this.getLongPollServer()
          console.log(`[vk:${this.id}] long poll запущен (group ${this.groupId})`)
        }

        const url = `${lp.server}?act=a_check&key=${lp.key}&ts=${lp.ts}&wait=25`
        const res = await fetch(url)
        const data = (await res.json()) as {
          ts?: string
          failed?: number
          updates?: Array<{ type: string; object: { message: VkMessage } }>
        }

        // failed=1 — устарел ts (берём новый); 2/3 — нужен новый key/сервер.
        if (data.failed === 1 && data.ts) {
          lp.ts = data.ts
          continue
        }
        if (data.failed === 2 || data.failed === 3) {
          lp = null // ключ/сервер устарели — переподключимся на следующей итерации
          continue
        }

        if (data.ts) lp.ts = data.ts
        for (const update of data.updates ?? []) {
          if (update.type === 'message_new') {
            await onMessage(this.normalize(update.object.message))
          }
        }
      } catch (err) {
        console.error(`[vk:${this.id}] ошибка опроса:`, (err as Error).message)
        lp = null // переподключимся после паузы
        await delay(3000)
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false
  }

  private async getLongPollServer(): Promise<LongPollServer> {
    const url = new URL(`${API}/groups.getLongPollServer`)
    url.search = new URLSearchParams({
      group_id: this.groupId,
      access_token: this.token,
      v: API_VERSION,
    }).toString()

    const res = await fetch(url)
    const json = (await res.json()) as {
      response?: LongPollServer
      error?: { error_msg: string }
    }
    if (json.error) throw new Error(`VK API: ${json.error.error_msg}`)
    if (!json.response) throw new Error('VK API: пустой ответ getLongPollServer')
    return json.response
  }

  private normalize(m: VkMessage): UnifiedMessage {
    return {
      id: String(m.id ?? m.conversation_message_id ?? Date.now()),
      source: 'vk',
      sourceNodeId: this.id,
      accountId: `vk-community:${this.groupId}`,
      dialogId: String(m.from_id),
      direction: 'in',
      author: { id: String(m.from_id) },
      text: m.text ?? '',
      attachments: (m.attachments ?? []).map((a) => ({ type: a.type })),
      receivedAt: new Date((m.date ?? Date.now() / 1000) * 1000).toISOString(),
      raw: m,
    }
  }
}

/** Минимально нужные поля сообщения VK. */
interface VkMessage {
  id?: number
  conversation_message_id?: number
  from_id: number
  text?: string
  date?: number
  attachments?: Array<{ type: string }>
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
