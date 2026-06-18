import {
  TelegramBotApi,
  escapeHtml,
  type Keyboard,
  type TgCallbackQuery,
  type TgMessage,
} from './client.js'
import type { Repo } from '../storage/repo.js'
import type { VkApi } from '../sources/vk-user/api.js'

const VIEW_LIMIT = 10

export const BOT_COMMANDS = [
  { command: 'dialogs', description: 'Диалоги — вкл/выкл отслеживание' },
  { command: 'tracked', description: 'Кого сейчас отслеживаю' },
  { command: 'help', description: 'Как пользоваться' },
]

export interface Control {
  handleMessage(msg: TgMessage): Promise<void>
  handleCallback(cb: TgCallbackQuery): Promise<void>
}

/**
 * Логика управляющего бота: список диалогов, переключение отслеживания,
 * просмотр содержимого. `tracked` — живой набор отслеживаемых диалогов:
 * переключатель меняет и хранилище, и его (чтобы live видел изменения сразу).
 */
export function createControl(
  bot: TelegramBotApi,
  repo: Repo,
  vk: VkApi,
  accountId: string,
  tracked: Set<string>,
  owner?: number,
): Control {
  async function refreshDialogs(): Promise<void> {
    const { dialogs } = await vk.getConversations(accountId)
    for (const d of dialogs) repo.upsertDialog(d)
  }

  function dialogsView(): { text: string; keyboard: Keyboard } {
    const dialogs = repo.listDialogs(accountId)
    const keyboard: Keyboard = dialogs.map((d) => [
      { text: `${d.selected ? '✅' : '⬜'} ${d.title}`, callback_data: `tog:${d.dialogId}` },
      { text: '👁', callback_data: `view:${d.dialogId}` },
    ])
    const trackedCount = dialogs.filter((d) => d.selected).length
    const text =
      `<b>Диалоги</b> (${dialogs.length}, отслеживается ${trackedCount})\n` +
      'Нажми на имя — вкл/выкл отслеживание, 👁 — показать переписку.'
    return { text, keyboard }
  }

  function trackedText(): string {
    const list = repo.listDialogs(accountId).filter((d) => d.selected)
    if (list.length === 0) return 'Пока никто не отслеживается. Открой /dialogs и выбери.'
    return '<b>Отслеживаю:</b>\n' + list.map((d) => `• ${escapeHtml(d.title)}`).join('\n')
  }

  function viewText(dialogId: string): string {
    const dialog = repo.listDialogs(accountId).find((d) => d.dialogId === dialogId)
    const messages = repo.getMessages(accountId, dialogId).slice(-VIEW_LIMIT)
    if (messages.length === 0) {
      return `«${escapeHtml(dialog?.title ?? dialogId)}»: сообщений в хранилище нет (сделай backfill).`
    }
    const lines = messages.map((m) => {
      const arrow = m.direction === 'out' ? '➡️' : '⬅️'
      const who = escapeHtml(m.authorName ?? m.authorId)
      const att = m.attachments.length ? ` 📎${m.attachments.length}` : ''
      return `${arrow} <b>${who}:</b> ${escapeHtml(m.text)}${att}`
    })
    return `<b>«${escapeHtml(dialog?.title ?? dialogId)}»</b> — последние ${messages.length}:\n\n${lines.join('\n')}`
  }

  async function handleMessage(msg: TgMessage): Promise<void> {
    const chatId = msg.chat.id
    if (owner && chatId !== owner) {
      await bot.sendMessage(chatId, 'Управление доступно только владельцу.')
      return
    }
    const cmd = (msg.text ?? '').trim().split(/\s+/)[0]?.toLowerCase().replace(/@.*$/, '')
    switch (cmd) {
      case '/start':
      case '/help':
        await bot.sendMessage(
          chatId,
          'Привет! Я доставляю сюда новые сообщения из отслеживаемых диалогов.\n\n' +
            '/dialogs — список диалогов, включить/выключить отслеживание\n' +
            '/tracked — кого отслеживаю сейчас',
        )
        break
      case '/dialogs': {
        await refreshDialogs()
        const { text, keyboard } = dialogsView()
        await bot.sendMessage(chatId, text, keyboard)
        break
      }
      case '/tracked':
        await bot.sendMessage(chatId, trackedText())
        break
      default:
        await bot.sendMessage(chatId, 'Не понял. Команды: /dialogs, /tracked, /help')
    }
  }

  async function handleCallback(cb: TgCallbackQuery): Promise<void> {
    const chatId = cb.message?.chat.id
    const messageId = cb.message?.message_id
    if (!chatId || !messageId) return
    if (owner && cb.from.id !== owner) {
      await bot.answerCallbackQuery(cb.id, 'Только владелец')
      return
    }
    const [action, dialogId] = (cb.data ?? '').split(':')

    if (action === 'tog' && dialogId) {
      const dialog = repo.listDialogs(accountId).find((d) => d.dialogId === dialogId)
      const next = !dialog?.selected
      repo.setDialogSelected(accountId, dialogId, next)
      if (next) tracked.add(dialogId)
      else tracked.delete(dialogId)
      await bot.answerCallbackQuery(cb.id, next ? 'Отслеживается ✅' : 'Выключено ⬜')
      const { text, keyboard } = dialogsView()
      await bot.editMessageText(chatId, messageId, text, keyboard)
    } else if (action === 'view' && dialogId) {
      await bot.answerCallbackQuery(cb.id)
      await bot.sendMessage(chatId, viewText(dialogId))
    } else {
      await bot.answerCallbackQuery(cb.id)
    }
  }

  return { handleMessage, handleCallback }
}

/** Цикл long polling: тянет апдейты и раздаёт обработчикам, пока isRunning(). */
export async function pollUpdates(
  bot: TelegramBotApi,
  control: Control,
  isRunning: () => boolean,
): Promise<void> {
  let offset = 0
  while (isRunning()) {
    try {
      const updates = await bot.getUpdates(offset)
      for (const u of updates) {
        offset = u.update_id + 1
        if (u.message?.text) await control.handleMessage(u.message)
        else if (u.callback_query) await control.handleCallback(u.callback_query)
      }
    } catch (err) {
      console.error('ошибка опроса:', (err as Error).message)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}
