import type { UnifiedMessage } from '../core/types.js'

export type MessageHandler = (msg: UnifiedMessage) => void | Promise<void>

/**
 * Источник входящих сообщений. Реализация (VK, Instagram, …) сама решает, как
 * получать данные — long poll, webhook или опрос — и зовёт onMessage на каждое
 * новое сообщение уже в нормализованном виде.
 */
export interface Source {
  readonly id: string
  start(onMessage: MessageHandler): Promise<void>
  stop(): Promise<void>
}
