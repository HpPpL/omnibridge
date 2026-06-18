import type { Destination } from './base.js'
import type { UnifiedMessage } from '../core/types.js'

export interface TelegramDestinationOptions {
  id: string
  botToken: string
  chatId: string
}

/** Назначение Telegram через Bot API sendMessage. */
export class TelegramDestination implements Destination {
  readonly id: string
  private readonly botToken: string
  private readonly chatId: string

  constructor(opts: TelegramDestinationOptions) {
    this.id = opts.id
    this.botToken = opts.botToken
    this.chatId = opts.chatId
  }

  async send(msg: UnifiedMessage): Promise<void> {
    const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: this.format(msg),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    const json = (await res.json()) as { ok: boolean; description?: string }
    if (!json.ok) throw new Error(`Telegram API: ${json.description ?? 'неизвестная ошибка'}`)
  }

  private format(msg: UnifiedMessage): string {
    const author = msg.author.name ?? msg.author.id
    const head = `<b>${escapeHtml(msg.source.toUpperCase())}</b> · от ${escapeHtml(author)}`
    const body = escapeHtml(msg.text) || '<i>(без текста)</i>'
    const att = msg.attachments.length ? `\n📎 вложений: ${msg.attachments.length}` : ''
    return `${head}\n${body}${att}`
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
