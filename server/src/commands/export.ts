import { writeFileSync } from 'node:fs'
import { openDb } from '../storage/db.js'
import { Repo } from '../storage/repo.js'

/**
 * Экспорт сохранённой истории диалога. Работает офлайн из SQLite (без сети).
 *
 *   npm run export -- --dialog <peer_id>                 # NDJSON в stdout
 *   npm run export -- --dialog <peer_id> --format json   # JSON-массив
 *   npm run export -- --dialog <peer_id> --out chat.ndjson
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function main(): void {
  const dialogId = arg('dialog')
  if (!dialogId) {
    console.error('✖ Укажи диалог: npm run export -- --dialog <peer_id>')
    process.exit(1)
  }
  const format = arg('format') ?? 'ndjson'
  const outPath = arg('out')
  const dbPath = process.env.DB_PATH ?? 'omnibridge.db'

  const db = openDb(dbPath)
  const repo = new Repo(db)

  // accountId: явный --account, иначе единственный аккаунт в хранилище.
  let accountId = arg('account')
  if (!accountId) {
    const accounts = repo.listAccounts()
    if (accounts.length === 1) accountId = accounts[0]
    else {
      console.error(`✖ Уточни аккаунт через --account. Доступны: ${accounts.join(', ') || '(нет)'}`)
      process.exit(1)
    }
  }

  const messages = repo.getMessages(accountId!, dialogId)
  if (messages.length === 0) {
    console.error('⚠ Сообщений по этому диалогу в хранилище нет. Запусти backfill.')
    process.exit(1)
  }

  const output =
    format === 'json'
      ? JSON.stringify(messages, null, 2)
      : messages.map((m) => JSON.stringify(m)).join('\n')

  if (outPath) {
    writeFileSync(outPath, output + '\n')
    console.error(`✔ ${messages.length} сообщений → ${outPath} (${format})`)
  } else {
    process.stdout.write(output + '\n')
  }

  db.close()
}

main()
