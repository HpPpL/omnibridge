/** Роль блока на канвасе. */
export type NodeKind = 'source' | 'destination'

/** Статус подключения интеграции. */
export type NodeStatus = 'connected' | 'unconfigured' | 'error'

/** Идентификаторы поддерживаемых платформ. */
export type PlatformId =
  | 'vk'
  | 'instagram'
  | 'whatsapp'
  | 'telegram'
  | 'slack'
  | 'discord'

/** Описание поля настройки интеграции (рендерится в боковой панели). */
export interface FieldSpec {
  key: string
  label: string
  placeholder?: string
  type?: 'text' | 'password'
  hint?: string
}

/** Статичные метаданные платформы. */
export interface PlatformMeta {
  id: PlatformId
  name: string
  /** Цвет акцента бренда. */
  color: string
  /** Короткая подпись под названием. */
  tagline: string
  /** Может ли платформа быть источником / назначением. */
  roles: NodeKind[]
  /** Поля, которые надо заполнить для подключения. */
  fields: FieldSpec[]
}

/** Блок на канвасе — конкретный экземпляр интеграции. */
export interface FlowNode {
  id: string
  kind: NodeKind
  platform: PlatformId
  /** Пользовательское имя блока. */
  title: string
  status: NodeStatus
  /** Заполненные пользователем значения полей. */
  config: Record<string, string>
}

/** Связь «источник → назначение». */
export interface Connection {
  id: string
  from: string // id source-блока
  to: string // id destination-блока
}
