import { forwardRef } from 'react'
import type { FlowNode } from '../types'
import { PLATFORMS, platformInitial } from '../platforms'

const STATUS_LABEL: Record<FlowNode['status'], string> = {
  connected: 'Подключено',
  unconfigured: 'Не настроено',
  error: 'Ошибка',
}

interface Props {
  node: FlowNode
  active: boolean
  onClick: (id: string) => void
  onRemove: (id: string) => void
}

/**
 * Карточка блока на канвасе. forwardRef нужен, чтобы родитель мог замерить
 * позицию и протянуть линию связи.
 */
const NodeCard = forwardRef<HTMLDivElement, Props>(function NodeCard(
  { node, active, onClick, onRemove },
  ref,
) {
  const meta = PLATFORMS[node.platform]
  return (
    <div
      ref={ref}
      className={`node ${active ? 'node--active' : ''}`}
      style={{ ['--accent' as string]: meta.color }}
      onClick={() => onClick(node.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(node.id)}
    >
      <div className="node__avatar">{platformInitial(node.platform)}</div>
      <div className="node__body">
        <div className="node__title">{node.title}</div>
        <div className="node__tagline">{meta.tagline}</div>
        <span className={`badge badge--${node.status}`}>
          <i className="badge__dot" />
          {STATUS_LABEL[node.status]}
        </span>
      </div>
      <button
        className="node__remove"
        title="Удалить блок"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(node.id)
        }}
      >
        ×
      </button>
    </div>
  )
})

export default NodeCard
