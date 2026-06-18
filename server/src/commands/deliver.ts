import { openDb } from '../storage/db.js'
import { Repo, type StoredMessage } from '../storage/repo.js'
import { createVkClient } from '../sources/vk-user/api.js'
import { TelegramDestination } from '../destinations/telegram.js'
import { ConsoleDestination } from '../destinations/console.js'
import type { Destination } from '../destinations/base.js'
import type { UnifiedMessage } from '../core/types.js'

/**
 * Выгружает сохранённую историю выбранных диалогов в назначения (Telegram/консоль).
 * Идемпотентно: уже доставленное (по delivered_to) пропускается.
 *
 *   VK_MOCK=1 npm run deliver                    # все выбранные диалоги
 *   npm run deliver -- --dialog 2001             # только один диалог
 */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function toUnified(
  accountId: string,
  dialogId: string,
  dialogTitle: string,
  s: StoredMessage,
): UnifiedMessage {
  return {
    id: s.messageId,
    source: 'vk',
    sourceNodeId: accountId,
    accountId,
    dialogId,
    dialogTitle,
    direction: s.direction,
    author: { id: s.authorId, name: s.authorName },
    text: s.text,
    attachments: s.attachments,
    replyTo: s.replyTo,
    receivedAt: s.ts,
  }
}

async function main(): Promise<void> {
  const dbPath = process.env.DB_PATH ?? 'omnibridge.db'
  const accountId = `vk:${await createVkClient().getOwnId()}`

  const db = openDb(dbPath)
  const repo = new Repo(db)

  const only = arg('dialog')
  let dialogs = repo.listDialogs(accountId).filter((d) => d.selected)
  if (only) dialogs = dialogs.filter((d) => d.dialogId === only)
  if (dialogs.length === 0) {
    console.error('✖ Нет диалогов для выгрузки. Сначала выбери (VK_DIALOGS) и сделай backfill.')
    process.exit(1)
  }

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

  const throttleMs = Number(process.env.DELIVER_THROTTLE_MS ?? 350)
  let sent = 0
  for (const d of dialogs) {
    const messages = repo.getMessages(accountId, d.dialogId)
    let dialogSent = 0
    for (const s of messages) {
      const m = toUnified(accountId, d.dialogId, d.title, s)
      for (const dest of destinations) {
        if (s.deliveredTo.includes(dest.id)) continue
        try {
          await dest.send(m)
          repo.markDelivered(m, dest.id)
          sent++
          dialogSent++
          await delay(throttleMs)
        } catch (err) {
          console.error(`  доставка в ${dest.id} упала:`, (err as Error).message)
        }
      }
    }
    console.log(`  ${d.title}: отправлено ${dialogSent} (всего в диалоге ${messages.length})`)
  }
  console.log(`\nГотово. Доставлено: ${sent}.`)

  db.close()
}

main().catch((err) => {
  console.error('✖', (err as Error).message)
  process.exit(1)
})
