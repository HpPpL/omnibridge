import { openDb } from '../storage/db.js'
import { Repo } from '../storage/repo.js'
import { createVkClient } from '../sources/vk-user/api.js'
import {
  TelegramBotApi,
  escapeHtml,
  type Keyboard,
  type TgCallbackQuery,
  type TgMessage,
} from '../telegram/client.js'

/**
 * Управляющий Telegram-бот: меню, список диалогов с переключателями отслеживания
 * и просмотр содержимого. Отслеживаемые диалоги (флаг selected) — те же, что
 * читают backfill/deliver/live.
 *
 *   VK_MOCK=1 npm run bot      # на мок-диалогах
 *   npm run bot                # реальные диалоги по VK_USER_TOKEN
 *
 * Управление разрешено только владельцу (TELEGRAM_CHAT_ID), если он задан.
 */
const VIEW_LIMIT = 10

async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.error('✖ Не задан TELEGRAM_BOT_TOKEN.')
    process.exit(1)
  }
  const owner = process.env.TELEGRAM_CHAT_ID ? Number(process.env.TELEGRAM_CHAT_ID) : undefined
  const dbPath = process.env.DB_PATH ?? 'omnibridge.db'

  const vk = createVkClient()
  const accountId = `vk:${await vk.getOwnId()}`
  const db = openDb(dbPath)
  const repo = new Repo(db)

  const bot = new TelegramBotApi(token)
  await bot.setMyCommands([
    { command: 'dialogs', description: 'Диалоги — вкл/выкл отслеживание' },
    { command: 'tracked', description: 'Кого сейчас отслеживаю' },
    { command: 'help', description: 'Как пользоваться' },
  ])

  /** Подтягивает актуальный список диалогов источника в хранилище. */
  async function refreshDialogs(): Promise<void> {
    const { dialogs } = await vk.getConversations(accountId)
    for (const d of dialogs) repo.upsertDialog(d)
  }

  function dialogsKeyboard(): { text: string; keyboard: Keyboard } {
    const dialogs = repo.listDialogs(accountId)
    const keyboard: Keyboard = dialogs.map((d) => [
      { text: `${d.selected ? '✅' : '⬜'} ${d.title}`, callback_data: `tog:${d.dialogId}` },
      { text: '👁', callback_data: `view:${d.dialogId}` },
    ])
    const tracked = dialogs.filter((d) => d.selected).length
    const text =
      `<b>Диалоги</b> (${dialogs.length}, отслеживается ${tracked})\n` +
      'Нажми на имя — вкл/выкл отслеживание, 👁 — показать переписку.'
    return { text, keyboard }
  }

  function trackedText(): string {
    const tracked = repo.listDialogs(accountId).filter((d) => d.selected)
    if (tracked.length === 0) return 'Пока никто не отслеживается. Открой /dialogs и выбери.'
    return '<b>Отслеживаю:</b>\n' + tracked.map((d) => `• ${escapeHtml(d.title)}`).join('\n')
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
          'Привет! Я доставляю сообщения из отслеживаемых диалогов.\n\n' +
            '/dialogs — список диалогов, включить/выключить отслеживание\n' +
            '/tracked — кого отслеживаю сейчас',
        )
        break
      case '/dialogs': {
        await refreshDialogs()
        const { text, keyboard } = dialogsKeyboard()
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

    if (action === 'tog') {
      const dialog = repo.listDialogs(accountId).find((d) => d.dialogId === dialogId)
      const next = !dialog?.selected
      repo.setDialogSelected(accountId, dialogId!, next)
      await bot.answerCallbackQuery(cb.id, next ? 'Отслеживается ✅' : 'Выключено ⬜')
      const { text, keyboard } = dialogsKeyboard()
      await bot.editMessageText(chatId, messageId, text, keyboard)
    } else if (action === 'view') {
      await bot.answerCallbackQuery(cb.id)
      await bot.sendMessage(chatId, viewText(dialogId!))
    } else {
      await bot.answerCallbackQuery(cb.id)
    }
  }

  console.log(`Бот запущен (аккаунт ${accountId}${owner ? `, владелец ${owner}` : ''}). Ctrl+C — стоп.`)
  let running = true
  process.on('SIGINT', () => {
    running = false
    db.close()
    console.log('\nостановлен.')
    process.exit(0)
  })

  let offset = 0
  while (running) {
    try {
      const updates = await bot.getUpdates(offset)
      for (const u of updates) {
        offset = u.update_id + 1
        if (u.message?.text) await handleMessage(u.message)
        else if (u.callback_query) await handleCallback(u.callback_query)
      }
    } catch (err) {
      console.error('ошибка опроса:', (err as Error).message)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

main().catch((err) => {
  console.error('✖', (err as Error).message)
  process.exit(1)
})
