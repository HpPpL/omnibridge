import { openDb } from '../storage/db.js'
import { Repo } from '../storage/repo.js'
import { createVkClient } from '../sources/vk-user/api.js'
import { VkClient } from '../sources/vk-user/client.js'
import { VkUserLiveSource, MockLiveSource } from '../sources/vk-user/live.js'
import { TelegramDestination } from '../destinations/telegram.js'
import { ConsoleDestination } from '../destinations/console.js'
import type { Source } from '../sources/base.js'
import type { Destination } from '../destinations/base.js'
import type { UnifiedMessage } from '../core/types.js'

/**
 * Стадия 3: держит live-сессию, ловит новые сообщения из выбранных диалогов,
 * сохраняет в хранилище и доставляет в назначения.
 *
 *   VK_MOCK=1 npm run live      # эмуляция новых сообщений (без токена и Telegram)
 *   npm run live                # реальный VK User Long Poll
 */
async function main(): Promise<void> {
  const dbPath = process.env.DB_PATH ?? 'omnibridge.db'
  const mock = process.env.VK_MOCK === '1'

  const accountId = `vk:${await createVkClient().getOwnId()}`

  const db = openDb(dbPath)
  const repo = new Repo(db)

  const selected = repo.selectedDialogIds(accountId)
  if (selected.length === 0) {
    console.error('✖ Нет выбранных диалогов. Сначала: npm run dialogs + VK_DIALOGS, затем backfill.')
    process.exit(1)
  }
  const titles = new Map(repo.listDialogs(accountId).map((d) => [d.dialogId, d.title]))

  // Назначения: Telegram если настроен, иначе консоль (чтобы доставка была видна).
  const destinations: Destination[] = []
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    destinations.push(
      new TelegramDestination({
        id: 'dst_tg',
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID,
      }),
    )
    console.log('Доставка: Telegram')
  } else {
    destinations.push(new ConsoleDestination())
    console.log('Доставка: консоль (Telegram не настроен — задай TELEGRAM_BOT_TOKEN/CHAT_ID)')
  }

  // Источник: мок или реальный long poll.
  let source: Source
  if (mock) {
    const count = Number(process.env.VK_MOCK_LIVE_COUNT ?? 3)
    const intervalMs = Number(process.env.VK_MOCK_LIVE_INTERVAL_MS ?? 1200)
    source = new MockLiveSource('vk_live', accountId, selected, { intervalMs, count })
    console.log(`Источник: мок (${count} новых, интервал ${intervalMs}мс)`)
  } else {
    const token = process.env.VK_USER_TOKEN
    if (!token) {
      console.error('✖ Нет VK_USER_TOKEN (или включи VK_MOCK=1).')
      process.exit(1)
    }
    source = new VkUserLiveSource('vk_live', new VkClient(token), accountId, new Set(selected))
    console.log('Источник: VK User Long Poll')
  }
  console.log(`Аккаунт ${accountId}, слушаем диалогов: ${selected.length}\n`)

  const onMessage = async (m: UnifiedMessage): Promise<void> => {
    m.dialogTitle = m.dialogTitle ?? titles.get(m.dialogId)
    const isNew = repo.saveMessage(m)
    console.log(`[live] ${m.dialogTitle ?? m.dialogId}: "${m.text}"${isNew ? '' : ' (дубль)'}`)
    for (const dest of destinations) {
      try {
        await dest.send(m)
        repo.markDelivered(m, dest.id)
      } catch (err) {
        console.error(`  доставка в ${dest.id} упала:`, (err as Error).message)
      }
    }
  }

  const shutdown = async (): Promise<void> => {
    console.log('\nостановка…')
    await source.stop()
    db.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  await source.start(onMessage)
  // Сюда доходим, когда источник остановился сам (мок отыграл свой лимит).
  console.log('\nГотово.')
  db.close()
}

main().catch((err) => {
  console.error('✖', (err as Error).message)
  process.exit(1)
})
