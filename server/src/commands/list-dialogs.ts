import { openDb } from '../storage/db.js'
import { Repo } from '../storage/repo.js'
import { VkApiError } from '../sources/vk-user/client.js'
import { createVkClient } from '../sources/vk-user/api.js'

/**
 * Стадия 1 (discovery): по user-токену забирает список диалогов аккаунта,
 * сохраняет в SQLite и печатает. Дальше пользователь отмечает нужные диалоги
 * (VK_DIALOGS / API), а стадии 2–3 их выгружают и слушают.
 *
 *   npm run dialogs
 */
async function main(): Promise<void> {
  const dbPath = process.env.DB_PATH ?? 'omnibridge.db'
  const limit = Number(process.env.VK_DIALOGS_LIMIT ?? 50)

  const client = createVkClient()
  const db = openDb(dbPath)
  const repo = new Repo(db)

  const ownId = await client.getOwnId()
  const accountId = `vk:${ownId}`
  console.log(`Аккаунт: ${accountId}\n`)

  const { dialogs, total } = await client.getConversations(accountId, { count: limit })
  for (const d of dialogs) repo.upsertDialog(d)

  // Если выбор задан через VK_DIALOGS (через запятую) — отметим выбранные.
  const preselect = (process.env.VK_DIALOGS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (preselect.length) {
    repo.setSelected(accountId, preselect)
    console.log(`Отмечено выбранными: ${preselect.join(', ')}\n`)
  }

  const stored = repo.listDialogs(accountId)
  const typeIcon: Record<string, string> = { user: '👤', chat: '👥', group: '📣' }
  console.log(`Диалогов получено: ${dialogs.length} из ${total}\n`)
  for (const d of stored) {
    const mark = d.selected ? '✓' : ' '
    const unread = d.unread ? ` · непроч. ${d.unread}` : ''
    console.log(`[${mark}] ${typeIcon[d.peerType] ?? '•'} ${d.dialogId.padEnd(12)} ${d.title}${unread}`)
  }
  console.log('\nЧтобы выбрать диалоги: VK_DIALOGS=<id1>,<id2> npm run dialogs')

  db.close()
}

main().catch((err) => {
  if (err instanceof VkApiError) {
    console.error(`✖ ${err.message}`)
    if (err.code === 5) console.error('  Токен недействителен или без прав messages.')
  } else {
    console.error('✖ Ошибка:', (err as Error).message)
  }
  process.exit(1)
})
