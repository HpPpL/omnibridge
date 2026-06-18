import { useEffect, useRef, useState } from 'react'
import type { NodeKind, PlatformId } from '../types'
import { ALL_PLATFORMS } from '../platforms'

interface Props {
  kind: NodeKind
  onPick: (platform: PlatformId) => void
}

/** Кнопка «+ добавить» с выпадающим списком доступных платформ. */
export default function AddMenu({ kind, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const options = ALL_PLATFORMS.filter((p) => p.roles.includes(kind))

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  return (
    <div className="addmenu" ref={ref}>
      <button className="addmenu__trigger" onClick={() => setOpen((o) => !o)}>
        + Добавить {kind === 'source' ? 'источник' : 'назначение'}
      </button>
      {open && (
        <div className="addmenu__list">
          {options.map((p) => (
            <button
              key={p.id}
              className="addmenu__item"
              onClick={() => {
                onPick(p.id)
                setOpen(false)
              }}
            >
              <span className="addmenu__dot" style={{ background: p.color }} />
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
