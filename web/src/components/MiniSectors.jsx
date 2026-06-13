import { useEffect, useMemo, useRef } from 'react'
import { fitTransform, formatLapTime } from './TrackMap.jsx'

const WIDTH = 800
const HEIGHT = 500
const PADDING = 24

function lighten(hex, f) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const mix = (c) => Math.round(c + (255 - c) * f)
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`
}

export default function MiniSectors({ session }) {
  const canvasRef = useRef(null)
  const ms = session.meta.minisectors

  // Team color per driver; the second car of a team gets a lightened shade
  // so the patchwork stays readable.
  const colors = useMemo(() => {
    const seen = {}
    const out = {}
    Object.entries(session.drivers).forEach(([code, d], i) => {
      const team = d.team?.color || ''
      const nth = team ? (seen[team] = (seen[team] ?? 0) + 1) : 1
      out[code] =
        nth > 1 && team ? lighten(team, 0.45) : team || `hsl(${Math.round((i * 137.5) % 360)} 85% 62%)`
    })
    return out
  }, [session])

  const winCounts = useMemo(() => {
    if (!ms) return []
    const c = {}
    ms.winners.forEach((w) => {
      c[w] = (c[w] ?? 0) + 1
    })
    return Object.entries(c).sort((a, b) => b[1] - a[1])
  }, [ms])

  useEffect(() => {
    if (!ms) return
    const canvas = canvasRef.current
    const dpr = window.devicePixelRatio || 1
    canvas.width = WIDTH * dpr
    canvas.height = HEIGHT * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const pole = session.drivers[session.meta.pole_driver].channels
    const t = fitTransform(pole.x, pole.y, WIDTH, HEIGHT, PADDING)
    const idx = (d) => Math.min(Math.round(d / 5), pole.x.length - 1)

    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    ctx.lineWidth = 5
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ms.winners.forEach((w, k) => {
      const i0 = idx(ms.boundaries[k])
      const i1 = idx(ms.boundaries[k + 1])
      ctx.strokeStyle = colors[w]
      ctx.beginPath()
      ctx.moveTo(t.toX(pole.x[i0]), t.toY(pole.y[i0]))
      for (let i = i0 + 1; i <= i1; i++) {
        ctx.lineTo(t.toX(pole.x[i]), t.toY(pole.y[i]))
      }
      ctx.stroke()
    })
    // close the loop in the final segment's color
    const last = ms.winners[ms.winners.length - 1]
    ctx.strokeStyle = colors[last]
    ctx.beginPath()
    ctx.moveTo(t.toX(pole.x[pole.x.length - 1]), t.toY(pole.y[pole.y.length - 1]))
    ctx.lineTo(t.toX(pole.x[0]), t.toY(pole.y[0]))
    ctx.stroke()
  }, [session, ms, colors])

  if (!ms) {
    return (
      <p className="status-note">
        This session JSON has no mini-sector data — rebuild it with the pipeline.
      </p>
    )
  }

  const gap = ms.composite_ideal - session.meta.pole_time

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div className="panel" style={{ flexShrink: 1, minWidth: 0 }}>
        <h2 className="panel-label">
          Mini-sector dominance <span className="mark">/ fastest driver per micro-segment</span>
        </h2>
        <canvas
          ref={canvasRef}
          className="board"
          style={{ width: WIDTH, height: HEIGHT, maxWidth: '100%' }}
        />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          {winCounts.map(([code, n]) => (
            <span key={code} className="legend-chip">
              <span className="legend-swatch" style={{ background: colors[code] }} />
              {code} <span className="muted">×{n}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="panel" style={{ minWidth: 250, flex: 1 }}>
        <h2 className="panel-label">Composite ideal lap</h2>
        <div
          className="mono"
          style={{
            fontSize: 34,
            fontWeight: 500,
            letterSpacing: '0.02em',
            color: 'var(--gain)',
            textShadow: '0 0 18px rgba(74, 222, 128, 0.35)',
          }}
        >
          {formatLapTime(ms.composite_ideal)}
        </div>
        <div className="mono muted" style={{ fontSize: 13, marginTop: 6 }}>
          {gap.toFixed(3)}s vs pole ({session.meta.pole_driver}{' '}
          {formatLapTime(session.meta.pole_time)})
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 14, lineHeight: 1.5 }}>
          Stitched from the fastest driver in each of the {ms.winners.length} micro-segments —
          a theoretical best no single lap achieved. Cross-lap comparisons at this resolution
          carry FastF1's ~±10 m position uncertainty, so treat individual segment wins as
          indicative, not exact.
        </p>
      </div>
    </div>
  )
}
