import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { Connection, FlowNode, NodeKind, PlatformId } from './types'
import { PLATFORMS } from './platforms'
import NodeCard from './components/NodeCard'
import ConfigDrawer from './components/ConfigDrawer'
import Connections, { type Edge } from './components/Connections'
import AddMenu from './components/AddMenu'

let idCounter = 100
const newId = (prefix: string) => `${prefix}_${idCounter++}`

function makeNode(kind: NodeKind, platform: PlatformId): FlowNode {
  return {
    id: newId(kind),
    kind,
    platform,
    title: PLATFORMS[platform].name,
    status: 'unconfigured',
    config: {},
  }
}

// Демо-состояние, чтобы канвас не был пустым при первом запуске.
const SEED_SOURCES: FlowNode[] = [
  { id: 'src_vk', kind: 'source', platform: 'vk', title: 'ВК сообщества', status: 'connected', config: { groupId: '210034', token: '••••' } },
  { id: 'src_ig', kind: 'source', platform: 'instagram', title: 'Instagram Direct', status: 'unconfigured', config: {} },
]
const SEED_DESTS: FlowNode[] = [
  { id: 'dst_tg', kind: 'destination', platform: 'telegram', title: 'Telegram «Входящие»', status: 'connected', config: { botToken: '••••', chatId: '-100123' } },
  { id: 'dst_sl', kind: 'destination', platform: 'slack', title: 'Slack #inbox', status: 'unconfigured', config: {} },
]
const SEED_CONNECTIONS: Connection[] = [
  { id: 'c1', from: 'src_vk', to: 'dst_tg' },
]

export default function App() {
  const [sources, setSources] = useState<FlowNode[]>(SEED_SOURCES)
  const [destinations, setDestinations] = useState<FlowNode[]>(SEED_DESTS)
  const [connections, setConnections] = useState<Connection[]>(SEED_CONNECTIONS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [edges, setEdges] = useState<Edge[]>([])

  const canvasRef = useRef<HTMLDivElement>(null)
  const nodeEls = useRef<Map<string, HTMLDivElement>>(new Map())

  const registerNode = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) nodeEls.current.set(id, el)
    else nodeEls.current.delete(id)
  }, [])

  const allNodes = [...sources, ...destinations]
  const selected = allNodes.find((n) => n.id === selectedId) ?? null

  // Пересчёт координат линий после каждого рендера и при ресайзе.
  useLayoutEffect(() => {
    function recompute() {
      const canvas = canvasRef.current
      if (!canvas) return
      const base = canvas.getBoundingClientRect()
      const next: Edge[] = []
      for (const c of connections) {
        const a = nodeEls.current.get(c.from)?.getBoundingClientRect()
        const b = nodeEls.current.get(c.to)?.getBoundingClientRect()
        if (!a || !b) continue
        next.push({
          id: c.id,
          x1: a.right - base.left,
          y1: a.top + a.height / 2 - base.top,
          x2: b.left - base.left,
          y2: b.top + b.height / 2 - base.top,
          color: PLATFORMS[sources.find((s) => s.id === c.from)?.platform ?? 'vk'].color,
        })
      }
      setEdges(next)
    }
    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [connections, sources, destinations])

  function updateNode(id: string, patch: Partial<FlowNode>) {
    const apply = (n: FlowNode) => (n.id === id ? { ...n, ...patch } : n)
    setSources((s) => s.map(apply))
    setDestinations((d) => d.map(apply))
  }

  function removeNode(id: string) {
    setSources((s) => s.filter((n) => n.id !== id))
    setDestinations((d) => d.filter((n) => n.id !== id))
    setConnections((c) => c.filter((x) => x.from !== id && x.to !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function addNode(kind: NodeKind, platform: PlatformId) {
    const node = makeNode(kind, platform)
    if (kind === 'source') setSources((s) => [...s, node])
    else setDestinations((d) => [...d, node])
    setSelectedId(node.id)
  }

  function toggleConnection(from: string, to: string) {
    setConnections((cs) => {
      const exists = cs.find((c) => c.from === from && c.to === to)
      if (exists) return cs.filter((c) => c !== exists)
      return [...cs, { id: newId('c'), from, to }]
    })
  }

  const counterparts = selected
    ? selected.kind === 'source'
      ? destinations
      : sources
    : []

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">→</span>
          <span className="brand__name">OmniBridge</span>
          <span className="brand__tag">конструктор миграции сообщений</span>
        </div>
        <div className="topbar__actions">
          <button className="btn btn--ghost">Сохранить черновик</button>
          <button className="btn btn--primary">▶ Запустить пайплайн</button>
        </div>
      </header>

      <main className="canvas" ref={canvasRef}>
        <Connections edges={edges} />

        <section className="column">
          <div className="column__head">
            <h2 className="column__title">Источники</h2>
            <span className="column__count">{sources.length}</span>
          </div>
          <p className="column__hint">Откуда забираем входящие сообщения</p>
          <div className="column__nodes">
            {sources.map((n) => (
              <NodeCard
                key={n.id}
                node={n}
                ref={registerNode(n.id)}
                active={n.id === selectedId}
                onClick={setSelectedId}
                onRemove={removeNode}
              />
            ))}
          </div>
          <AddMenu kind="source" onPick={(p) => addNode('source', p)} />
        </section>

        <div className="column-divider" aria-hidden />

        <section className="column column--right">
          <div className="column__head">
            <h2 className="column__title">Назначения</h2>
            <span className="column__count">{destinations.length}</span>
          </div>
          <p className="column__hint">Куда доставляем сообщения</p>
          <div className="column__nodes">
            {destinations.map((n) => (
              <NodeCard
                key={n.id}
                node={n}
                ref={registerNode(n.id)}
                active={n.id === selectedId}
                onClick={setSelectedId}
                onRemove={removeNode}
              />
            ))}
          </div>
          <AddMenu kind="destination" onPick={(p) => addNode('destination', p)} />
        </section>
      </main>

      {selected && (
        <ConfigDrawer
          node={selected}
          counterparts={counterparts}
          connections={connections}
          onClose={() => setSelectedId(null)}
          onSave={updateNode}
          onToggleConnection={toggleConnection}
        />
      )}
    </div>
  )
}
