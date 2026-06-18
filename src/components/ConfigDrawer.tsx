import { useEffect, useState } from 'react'
import type { Connection, FlowNode } from '../types'
import { PLATFORMS } from '../platforms'

interface Props {
  node: FlowNode
  /** Блоки противоположной колонки — для выбора связей. */
  counterparts: FlowNode[]
  connections: Connection[]
  onClose: () => void
  onSave: (id: string, patch: Partial<FlowNode>) => void
  onToggleConnection: (sourceId: string, destId: string) => void
}

/** Боковая панель настройки интеграции выбранного блока. */
export default function ConfigDrawer({
  node,
  counterparts,
  connections,
  onClose,
  onSave,
  onToggleConnection,
}: Props) {
  const meta = PLATFORMS[node.platform]
  const [title, setTitle] = useState(node.title)
  const [config, setConfig] = useState<Record<string, string>>(node.config)

  // Переключились на другой блок — перечитываем его значения.
  useEffect(() => {
    setTitle(node.title)
    setConfig(node.config)
  }, [node.id])

  const allFilled = meta.fields.every((f) => (config[f.key] ?? '').trim() !== '')

  function save() {
    onSave(node.id, {
      title: title.trim() || meta.name,
      config,
      status: allFilled ? 'connected' : 'unconfigured',
    })
    onClose()
  }

  function isLinked(otherId: string) {
    return connections.some(
      (c) =>
        (node.kind === 'source' && c.from === node.id && c.to === otherId) ||
        (node.kind === 'destination' && c.to === node.id && c.from === otherId),
    )
  }

  return (
    <>
      <div className="drawer__scrim" onClick={onClose} />
      <aside className="drawer" style={{ ['--accent' as string]: meta.color }}>
        <header className="drawer__head">
          <div>
            <div className="drawer__kicker">
              {node.kind === 'source' ? 'Источник' : 'Назначение'} · {meta.name}
            </div>
            <h2 className="drawer__title">Настройка интеграции</h2>
          </div>
          <button className="drawer__close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="drawer__scroll">
          <label className="field">
            <span className="field__label">Название блока</span>
            <input
              className="field__input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={meta.name}
            />
          </label>

          <div className="field__group-title">Параметры доступа</div>
          {meta.fields.map((f) => (
            <label className="field" key={f.key}>
              <span className="field__label">{f.label}</span>
              <input
                className="field__input"
                type={f.type === 'password' ? 'password' : 'text'}
                value={config[f.key] ?? ''}
                placeholder={f.placeholder}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, [f.key]: e.target.value }))
                }
              />
              {f.hint && <span className="field__hint">{f.hint}</span>}
            </label>
          ))}

          <div className="field__group-title">
            {node.kind === 'source' ? 'Куда отправлять' : 'Откуда получать'}
          </div>
          <div className="links">
            {counterparts.length === 0 && (
              <p className="links__empty">
                Добавьте блок в противоположной колонке, чтобы связать.
              </p>
            )}
            {counterparts.map((other) => {
              const linked = isLinked(other.id)
              return (
                <button
                  key={other.id}
                  className={`link-chip ${linked ? 'link-chip--on' : ''}`}
                  onClick={() =>
                    node.kind === 'source'
                      ? onToggleConnection(node.id, other.id)
                      : onToggleConnection(other.id, node.id)
                  }
                >
                  <i className="link-chip__check">{linked ? '✓' : '+'}</i>
                  {other.title}
                </button>
              )
            })}
          </div>
        </div>

        <footer className="drawer__foot">
          <button className="btn btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn--primary" onClick={save}>
            Сохранить
          </button>
        </footer>
      </aside>
    </>
  )
}
