export interface Edge {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}

/** SVG-слой с кривыми Безье между блоками источника и назначения. */
export default function Connections({ edges }: { edges: Edge[] }) {
  return (
    <svg className="wires" aria-hidden>
      {edges.map((e) => {
        const dx = Math.max(40, (e.x2 - e.x1) * 0.5)
        const d = `M ${e.x1} ${e.y1} C ${e.x1 + dx} ${e.y1}, ${e.x2 - dx} ${e.y2}, ${e.x2} ${e.y2}`
        return (
          <g key={e.id}>
            <path className="wire" d={d} stroke={e.color} />
            <circle className="wire__dot" cx={e.x2} cy={e.y2} r={4} fill={e.color} />
            <circle className="wire__dot" cx={e.x1} cy={e.y1} r={4} fill={e.color} />
          </g>
        )
      })}
    </svg>
  )
}
