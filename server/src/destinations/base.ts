import type { UnifiedMessage } from '../core/types.js'

/**
 * Назначение — куда доставляем сообщение. Реализация (Telegram, Slack, …)
 * форматирует UnifiedMessage под свой API и отправляет.
 */
export interface Destination {
  readonly id: string
  send(msg: UnifiedMessage): Promise<void>
}
