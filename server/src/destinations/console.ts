import type { Destination } from './base.js'
import type { UnifiedMessage } from '../core/types.js'

/** Назначение-заглушка: печатает сообщение в консоль (для отладки без Telegram). */
export class ConsoleDestination implements Destination {
  readonly id = 'console'

  async send(msg: UnifiedMessage): Promise<void> {
    const who = msg.author.name ?? msg.author.id
    const att = msg.attachments.length ? ` 📎${msg.attachments.length}` : ''
    console.log(`    → [console] ${msg.dialogTitle ?? msg.dialogId} | ${who}: ${msg.text}${att}`)
  }
}
