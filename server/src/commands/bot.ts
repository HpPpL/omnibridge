import { openDb } from '../storage/db.js'
import { Repo } from '../storage/repo.js'
import { createVkClient } from '../sources/vk-user/api.js'
import { TelegramBotApi } from '../telegram/client.js'
import { BOT_COMMANDS, createControl, pollUpdates } from '../telegram/control.js'

/**
 * Управляющий Telegram-бот: меню, список диалогов с переключателями отслеживания
 * и просмотр содержимого (без live-доставки — её добавляет `npm run serve`).
 *
 *   VK_MOCK=1 npm run bot      # на мок-диалогах
 *   npm run bot                # реальные диалоги по VK_USER_TOKEN
 */
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
  await bot.setMyCommands(BOT_COMMANDS)

  const tracked = new Set(repo.selectedDialogIds(accountId))
  const control = createControl(bot, repo, vk, accountId, tracked, owner)

  let running = true
  process.on('SIGINT', () => {
    running = false
    db.close()
    console.log('\nостановлен.')
    process.exit(0)
  })

  console.log(`Бот запущен (аккаунт ${accountId}${owner ? `, владелец ${owner}` : ''}). Ctrl+C — стоп.`)
  await pollUpdates(bot, control, () => running)
}

main().catch((err) => {
  console.error('✖', (err as Error).message)
  process.exit(1)
})
