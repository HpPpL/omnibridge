import { openDb } from '../storage/db.js'
import { Repo } from '../storage/repo.js'
import { createVkClient } from '../sources/vk-user/api.js'
import { VkClient } from '../sources/vk-user/client.js'
import { VkUserLiveSource, MockLiveSource } from '../sources/vk-user/live.js'
import { TelegramBotApi, escapeHtml } from '../telegram/client.js'
import { BOT_COMMANDS, createControl, pollUpdates } from '../telegram/control.js'
import type { Source } from '../sources/base.js'
import type { UnifiedMessage } from '../core/types.js'

/**
 * Объединённый процесс: управляющий бот (меню, выбор диалогов) + live-доставка.
 * Включил диалог в боте — новые сообщения по нему сами доезжают в чат владельца.
 *
 *   VK_MOCK=1 npm run serve     # бот + эмуляция новых сообщений
 *   npm run serve               # бот + реальный VK User Long Poll
 */
function formatMessage(m: UnifiedMessage): string {
  const who = escapeHtml(m.author.name ?? m.author.id)
  const where = escapeHtml(m.dialogTitle ?? m.dialogId)
  const att = m.attachments.length ? `\n📎 вложений: ${m.attachments.length}` : ''
  return `<b>VK</b> · ${where} · от ${who}\n${escapeHtml(m.text) || '<i>(без текста)</i>'}${att}`
}

async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.error('✖ Не задан TELEGRAM_BOT_TOKEN.')
    process.exit(1)
  }
  const owner = process.env.TELEGRAM_CHAT_ID ? Number(process.env.TELEGRAM_CHAT_ID) : undefined
  if (!owner) {
    console.error('✖ Нужен TELEGRAM_CHAT_ID — чат, куда доставлять новые сообщения.')
    process.exit(1)
  }
  const dbPath = process.env.DB_PATH ?? 'omnibridge.db'
  const mock = process.env.VK_MOCK === '1'

  const vk = createVkClient()
  const accountId = `vk:${await vk.getOwnId()}`
  const db = openDb(dbPath)
  const repo = new Repo(db)

  const bot = new TelegramBotApi(token)
  await bot.setMyCommands(BOT_COMMANDS)

  // Живой набор отслеживаемых — общий для бота (переключатели) и доставки.
  const tracked = new Set(repo.selectedDialogIds(accountId))
  const control = createControl(bot, repo, vk, accountId, tracked, owner)
  const titles = new Map(repo.listDialogs(accountId).map((d) => [d.dialogId, d.title]))

  // Источник новых сообщений.
  let source: Source
  if (mock) {
    const intervalMs = Number(process.env.VK_MOCK_LIVE_INTERVAL_MS ?? 8000)
    const allDialogs = repo.listDialogs(accountId).map((d) => d.dialogId)
    source = new MockLiveSource('vk_live', accountId, allDialogs, { intervalMs, count: 0 })
    console.log(`Источник: мок (новое каждые ${intervalMs}мс)`)
  } else {
    if (!process.env.VK_USER_TOKEN) {
      console.error('✖ Нет VK_USER_TOKEN (или включи VK_MOCK=1).')
      process.exit(1)
    }
    source = new VkUserLiveSource('vk_live', new VkClient(process.env.VK_USER_TOKEN), accountId)
    console.log('Источник: VK User Long Poll')
  }

  const onMessage = async (m: UnifiedMessage): Promise<void> => {
    if (!tracked.has(m.dialogId)) return // доставляем только отслеживаемые
    m.dialogTitle = m.dialogTitle ?? titles.get(m.dialogId)
    const isNew = repo.saveMessage(m)
    if (!isNew) return
    try {
      await bot.sendMessage(owner, formatMessage(m))
      repo.markDelivered(m, 'dst_tg')
    } catch (err) {
      console.error('доставка упала:', (err as Error).message)
    }
  }

  let running = true
  const shutdown = async (): Promise<void> => {
    running = false
    await source.stop()
    db.close()
    console.log('\nостановлен.')
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  console.log(`serve запущен: бот + live (аккаунт ${accountId}, владелец ${owner}). Ctrl+C — стоп.`)
  // Бот-опрос и live-источник крутятся параллельно.
  await Promise.all([pollUpdates(bot, control, () => running), source.start(onMessage)])
}

main().catch((err) => {
  console.error('✖', (err as Error).message)
  process.exit(1)
})
