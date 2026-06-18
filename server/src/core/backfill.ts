import type { VkApi } from '../sources/vk-user/api.js'
import type { Repo } from '../storage/repo.js'
import type { Dialog } from './types.js'

/** Размер страницы истории (VK допускает до 200). */
const PAGE = 100

/**
 * Выгружает историю одного диалога постранично. Идемпотентно (дубли отсекает
 * хранилище) и возобновляемо: позиция хранится в backfill_cursor, так что
 * повторный запуск продолжает с места обрыва, а завершённый — пропускается.
 */
export async function backfillDialog(
  api: VkApi,
  repo: Repo,
  dialog: Dialog,
): Promise<{ saved: number; total: number }> {
  const cursor = repo.getBackfillCursor(dialog.accountId, dialog.dialogId)
  if (cursor.done) return { saved: 0, total: repo.countMessages(dialog.accountId, dialog.dialogId) }

  let offset = cursor.nextOffset
  let saved = 0
  let total = 0

  for (;;) {
    const page = await api.getHistory(dialog.accountId, dialog.dialogId, { offset, count: PAGE })
    total = page.total

    if (page.messages.length === 0) {
      repo.setBackfillCursor(dialog.accountId, dialog.dialogId, offset, true)
      break
    }

    for (const m of page.messages) {
      if (repo.saveMessage(m)) saved++
    }
    offset += page.messages.length

    const finished = offset >= total
    repo.setBackfillCursor(dialog.accountId, dialog.dialogId, offset, finished)
    if (finished) break
  }

  return { saved, total }
}
