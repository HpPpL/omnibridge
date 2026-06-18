import type { Source, MessageHandler } from '../base.js'
import type { UnifiedMessage } from '../../core/types.js'
import type { VkClient } from './client.js'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface LongPollServer {
  server: string
  key: string
  ts: string
}

/**
 * Live-источник личных сообщений ВК на User Long Poll. Держит соединение,
 * по событию «новое сообщение» (код 4) тянет тело через getById и отдаёт
 * входящие из выбранных диалогов.
 */
export class VkUserLiveSource implements Source {
  readonly id: string
  private running = false

  constructor(
    id: string,
    private readonly client: VkClient,
    private readonly accountId: string,
  ) {
    this.id = id
  }

  async start(onMessage: MessageHandler): Promise<void> {
    this.running = true
    let lp = await this.getServer()
    console.log(`[vk-live:${this.id}] long poll запущен`)
    let ts = lp.ts

    while (this.running) {
      try {
        const url = `https://${lp.server}?act=a_check&key=${lp.key}&ts=${ts}&wait=25&mode=2&version=3`
        const data = (await (await fetch(url)).json()) as {
          ts?: string
          failed?: number
          updates?: unknown[][]
        }

        if (data.failed === 1 && data.ts) {
          ts = data.ts
          continue
        }
        if (data.failed === 2 || data.failed === 3) {
          lp = await this.getServer()
          ts = lp.ts
          continue
        }
        if (data.ts) ts = data.ts

        // Код 4 = новое сообщение; updates[i] = [4, message_id, ...].
        const ids = (data.updates ?? [])
          .filter((u) => u[0] === 4)
          .map((u) => String(u[1]))
        if (ids.length) {
          const messages = await this.client.getById(this.accountId, ids)
          // Фильтрацию по отслеживаемым диалогам делает потребитель (выбор меняется на лету).
          for (const m of messages) {
            if (m.direction === 'in') await onMessage(m)
          }
        }
      } catch (err) {
        console.error(`[vk-live:${this.id}] ошибка:`, (err as Error).message)
        await delay(3000)
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false
  }

  private getServer(): Promise<LongPollServer> {
    return this.client.api<LongPollServer>('messages.getLongPollServer', {
      need_pts: 1,
      lp_version: 3,
    })
  }
}

/**
 * Мок live-источника: эмулирует приход новых входящих сообщений в выбранные
 * диалоги. Даёт прогнать сохранение + доставку end-to-end без токена.
 */
export class MockLiveSource implements Source {
  readonly id: string
  private running = false

  constructor(
    id: string,
    private readonly accountId: string,
    private readonly dialogIds: string[],
    private readonly opts: { intervalMs: number; count: number },
  ) {
    this.id = id
  }

  async start(onMessage: MessageHandler): Promise<void> {
    this.running = true
    // count <= 0 — бесконечный поток (для долгоживущего serve).
    for (let n = 1; this.running && (this.opts.count <= 0 || n <= this.opts.count); n++) {
      await delay(this.opts.intervalMs)
      if (!this.running) break
      const dialogId = this.dialogIds[(n - 1) % this.dialogIds.length]!
      const msg: UnifiedMessage = {
        id: `live${Date.now()}${n}`,
        source: 'vk',
        sourceNodeId: this.accountId,
        accountId: this.accountId,
        dialogId,
        direction: 'in',
        author: { id: dialogId, name: 'Собеседник' },
        text: `Новое сообщение #${n} (live, mock)`,
        attachments: [],
        receivedAt: new Date().toISOString(),
      }
      await onMessage(msg)
    }
  }

  async stop(): Promise<void> {
    this.running = false
  }
}
