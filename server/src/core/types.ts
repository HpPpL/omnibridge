/** Вложение в нормализованном виде (общее для всех источников). */
export interface Attachment {
  type: string
  url?: string
  title?: string
}

/** Тип собеседника в диалоге. */
export type PeerType = 'user' | 'chat' | 'group'

/** Направление сообщения относительно владельца сессии. */
export type Direction = 'in' | 'out'

/**
 * Диалог (переписка) аккаунта-источника: личка, беседа или сообщество.
 * Пользователь выбирает, какие диалоги выгружать и слушать.
 */
export interface Dialog {
  /** id аккаунта-владельца сессии (напр. 'vk:12345'). */
  accountId: string
  /** id собеседника/беседы в платформе (VK peer_id). */
  dialogId: string
  peerType: PeerType
  title: string
  unread: number
  lastMessageId?: string
}

/**
 * Нормализованное сообщение — общий формат между источниками и назначениями.
 * Любой источник приводит свой сырой объект к этому виду, любое назначение
 * умеет его отправить.
 */
export interface UnifiedMessage {
  /** id сообщения в исходной платформе. */
  id: string
  /** Платформа-источник, напр. 'vk'. */
  source: string
  /** id блока-источника / аккаунта в пайплайне. */
  sourceNodeId: string
  /** id аккаунта-владельца сессии. */
  accountId: string
  /** id диалога, к которому относится сообщение. */
  dialogId: string
  /** Человекочитаемое имя диалога (если известно). */
  dialogTitle?: string
  /** Входящее или исходящее относительно владельца сессии. */
  direction: Direction
  author: { id: string; name?: string }
  text: string
  attachments: Attachment[]
  /** id сообщения, на которое это ответ (если есть). */
  replyTo?: string
  /** Время получения/отправки, ISO-8601. */
  receivedAt: string
  /** Сырой объект источника — на случай отладки/расширения. */
  raw?: unknown
}
