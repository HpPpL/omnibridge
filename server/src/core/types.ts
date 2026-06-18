/** Вложение в нормализованном виде (общее для всех источников). */
export interface Attachment {
  type: string
  url?: string
  title?: string
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
  /** id блока-источника в пайплайне. */
  sourceNodeId: string
  author: { id: string; name?: string }
  text: string
  attachments: Attachment[]
  /** Время получения, ISO-8601. */
  receivedAt: string
  /** Сырой объект источника — на случай отладки/расширения. */
  raw?: unknown
}
