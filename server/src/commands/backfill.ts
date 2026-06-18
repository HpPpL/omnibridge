import { openDb } from '../storage/db.js'
import { Repo } from '../storage/repo.js'
import { createVkClient } from '../sources/vk-user/api.js'
import { backfillDialog } from '../core/backfill.js'

/**
 * Стадия 2: выгружает историю выбранных диалогов в SQLite.
 *
 *   VK_MOCK=1 npm run backfill        # на фейковых данных
 *   npm run backfill                  # по VK_USER_TOKEN
 *
 * Идемпотентно и возобновляемо: повторный запуск добавит только новое.
 */
async function main(): Promise<void> {
  const dbPath = process.env.DB_PATH ?? 'omnibridge.db'

  const client = createVkClient()
  const ownId = await client.getOwnId()
  const accountId = `vk:${ownId}`

  const db = openDb(dbPath)
  const repo = new Repo(db)

  const selected = repo.listDialogs(accountId).filter((d) => d.selected)
  if (selected.length === 0) {
    console.error('✖ Нет выбранных диалогов.')
    console.error('  Сначала: npm run dialogs, затем VK_DIALOGS=<id1>,<id2> npm run dialogs')
    process.exit(1)
  }

  console.log(`Бэкфилл ${selected.length} диалог(ов) аккаунта ${accountId}\n`)
  let totalSaved = 0
  for (const d of selected) {
    const { saved, total } = await backfillDialog(client, repo, d)
    totalSaved += saved
    const have = repo.countMessages(accountId, d.dialogId)
    console.log(`  ${d.dialogId.padEnd(12)} ${d.title}: +${saved} (в хранилище ${have} из ${total})`)
  }
  console.log(`\nГотово. Новых сообщений: ${totalSaved}.`)
  console.log('Экспорт диалога: npm run export -- --dialog <id>')

  db.close()
}

main().catch((err) => {
  console.error('✖', (err as Error).message)
  process.exit(1)
})
