import type { DatabaseSync } from 'node:sqlite'
import type { Dialog, UnifiedMessage } from '../core/types.js'

/**
 * Типизированный доступ к хранилищу: диалоги, сообщения, курсоры. Вся работа с
 * SQL заперта здесь, остальной код оперирует доменными типами.
 */
export class Repo {
  constructor(private readonly db: DatabaseSync) {}

  /** Создаёт/обновляет диалог, сохраняя пользовательский флаг selected. */
  upsertDialog(d: Dialog): void {
    this.db
      .prepare(
        `INSERT INTO dialogs (account_id, dialog_id, peer_type, title, unread, last_message_id, selected, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(account_id, dialog_id) DO UPDATE SET
           peer_type = excluded.peer_type,
           title = excluded.title,
           unread = excluded.unread,
           last_message_id = excluded.last_message_id,
           updated_at = excluded.updated_at`,
      )
      .run(
        d.accountId,
        d.dialogId,
        d.peerType,
        d.title,
        d.unread,
        d.lastMessageId ?? null,
        new Date().toISOString(),
      )
  }

  setSelected(accountId: string, dialogIds: string[]): void {
    this.db.prepare('UPDATE dialogs SET selected = 0 WHERE account_id = ?').run(accountId)
    const stmt = this.db.prepare(
      'UPDATE dialogs SET selected = 1 WHERE account_id = ? AND dialog_id = ?',
    )
    for (const id of dialogIds) stmt.run(accountId, id)
  }

  listDialogs(accountId: string): Array<Dialog & { selected: boolean }> {
    const rows = this.db
      .prepare(
        `SELECT dialog_id, peer_type, title, unread, last_message_id, selected
         FROM dialogs WHERE account_id = ? ORDER BY updated_at DESC`,
      )
      .all(accountId) as Array<{
      dialog_id: string
      peer_type: string
      title: string
      unread: number
      last_message_id: string | null
      selected: number
    }>
    return rows.map((r) => ({
      accountId,
      dialogId: r.dialog_id,
      peerType: r.peer_type as Dialog['peerType'],
      title: r.title,
      unread: r.unread,
      lastMessageId: r.last_message_id ?? undefined,
      selected: r.selected === 1,
    }))
  }

  selectedDialogIds(accountId: string): string[] {
    const rows = this.db
      .prepare('SELECT dialog_id FROM dialogs WHERE account_id = ? AND selected = 1')
      .all(accountId) as Array<{ dialog_id: string }>
    return rows.map((r) => r.dialog_id)
  }

  /** Сохраняет сообщение идемпотентно (по ключу). Возвращает true, если новое. */
  saveMessage(m: UnifiedMessage): boolean {
    const res = this.db
      .prepare(
        `INSERT INTO messages
           (account_id, dialog_id, message_id, direction, author_id, author_name, text, attachments, reply_to, ts, delivered_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')
         ON CONFLICT(account_id, dialog_id, message_id) DO NOTHING`,
      )
      .run(
        m.accountId,
        m.dialogId,
        m.id,
        m.direction,
        m.author.id,
        m.author.name ?? null,
        m.text,
        JSON.stringify(m.attachments),
        m.replyTo ?? null,
        m.receivedAt,
      )
    return res.changes > 0
  }

  markDelivered(m: UnifiedMessage, destinationId: string): void {
    const row = this.db
      .prepare(
        'SELECT delivered_to FROM messages WHERE account_id = ? AND dialog_id = ? AND message_id = ?',
      )
      .get(m.accountId, m.dialogId, m.id) as { delivered_to: string } | undefined
    const list: string[] = row ? JSON.parse(row.delivered_to) : []
    if (list.includes(destinationId)) return
    list.push(destinationId)
    this.db
      .prepare(
        'UPDATE messages SET delivered_to = ? WHERE account_id = ? AND dialog_id = ? AND message_id = ?',
      )
      .run(JSON.stringify(list), m.accountId, m.dialogId, m.id)
  }

  getBackfillCursor(accountId: string, dialogId: string): { nextOffset: number; done: boolean } {
    const row = this.db
      .prepare('SELECT next_offset, done FROM backfill_cursor WHERE account_id = ? AND dialog_id = ?')
      .get(accountId, dialogId) as { next_offset: number; done: number } | undefined
    return { nextOffset: row?.next_offset ?? 0, done: row?.done === 1 }
  }

  setBackfillCursor(accountId: string, dialogId: string, nextOffset: number, done: boolean): void {
    this.db
      .prepare(
        `INSERT INTO backfill_cursor (account_id, dialog_id, next_offset, done)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(account_id, dialog_id) DO UPDATE SET
           next_offset = excluded.next_offset, done = excluded.done`,
      )
      .run(accountId, dialogId, nextOffset, done ? 1 : 0)
  }

  getLiveTs(accountId: string): string | undefined {
    const row = this.db.prepare('SELECT ts FROM live_state WHERE account_id = ?').get(accountId) as
      | { ts: string | null }
      | undefined
    return row?.ts ?? undefined
  }

  setLiveTs(accountId: string, ts: string): void {
    this.db
      .prepare(
        `INSERT INTO live_state (account_id, ts) VALUES (?, ?)
         ON CONFLICT(account_id) DO UPDATE SET ts = excluded.ts`,
      )
      .run(accountId, ts)
  }
}
