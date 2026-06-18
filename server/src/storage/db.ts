import { DatabaseSync } from 'node:sqlite'

/**
 * Открывает БД и накатывает схему. Используем встроенный node:sqlite
 * (флаг --experimental-sqlite), чтобы не тянуть зависимости.
 */
export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec(SCHEMA)
  return db
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS dialogs (
  account_id      TEXT NOT NULL,
  dialog_id       TEXT NOT NULL,
  peer_type       TEXT NOT NULL,
  title           TEXT NOT NULL,
  unread          INTEGER NOT NULL DEFAULT 0,
  last_message_id TEXT,
  selected        INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT NOT NULL,
  PRIMARY KEY (account_id, dialog_id)
);

CREATE TABLE IF NOT EXISTS messages (
  account_id   TEXT NOT NULL,
  dialog_id    TEXT NOT NULL,
  message_id   TEXT NOT NULL,
  direction    TEXT NOT NULL,
  author_id    TEXT NOT NULL,
  author_name  TEXT,
  text         TEXT NOT NULL DEFAULT '',
  attachments  TEXT NOT NULL DEFAULT '[]',
  reply_to     TEXT,
  ts           TEXT NOT NULL,
  delivered_to TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (account_id, dialog_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages (account_id, dialog_id, ts);

-- Курсор бэкфилла истории по диалогу: до какого offset выгребли и завершено ли.
CREATE TABLE IF NOT EXISTS backfill_cursor (
  account_id TEXT NOT NULL,
  dialog_id  TEXT NOT NULL,
  next_offset INTEGER NOT NULL DEFAULT 0,
  done        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, dialog_id)
);

-- Состояние live-сессии Long Poll по аккаунту.
CREATE TABLE IF NOT EXISTS live_state (
  account_id TEXT PRIMARY KEY,
  ts         TEXT,
  pts        TEXT
);
`
