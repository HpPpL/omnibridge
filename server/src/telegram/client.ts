const API = 'https://api.telegram.org'

export interface TgChat {
  id: number
}
export interface TgMessage {
  message_id: number
  chat: TgChat
  from?: { id: number }
  text?: string
}
export interface TgCallbackQuery {
  id: string
  from: { id: number }
  data?: string
  message?: { message_id: number; chat: TgChat }
}
export interface TgUpdate {
  update_id: number
  message?: TgMessage
  callback_query?: TgCallbackQuery
}

export interface InlineButton {
  text: string
  callback_data: string
}
export type Keyboard = InlineButton[][]

export interface BotCommand {
  command: string
  description: string
}

/** Тонкий клиент Telegram Bot API: long polling + сообщения с кнопками. */
export class TelegramBotApi {
  constructor(private readonly token: string) {}

  private async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`${API}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
    })
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string }
    if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? 'ошибка'}`)
    return json.result as T
  }

  getUpdates(offset: number, timeout = 25): Promise<TgUpdate[]> {
    return this.call<TgUpdate[]>('getUpdates', {
      offset,
      timeout,
      allowed_updates: ['message', 'callback_query'],
    })
  }

  sendMessage(chatId: number, text: string, keyboard?: Keyboard): Promise<TgMessage> {
    return this.call<TgMessage>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
    })
  }

  editMessageText(chatId: number, messageId: number, text: string, keyboard?: Keyboard): Promise<unknown> {
    return this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
    })
  }

  answerCallbackQuery(id: string, text?: string): Promise<unknown> {
    return this.call('answerCallbackQuery', { callback_query_id: id, text })
  }

  setMyCommands(commands: BotCommand[]): Promise<unknown> {
    return this.call('setMyCommands', { commands })
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
