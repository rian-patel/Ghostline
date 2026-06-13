import { useEffect, useMemo, useRef, useState } from 'react'
import { Scatter, ScatterChart, XAxis, YAxis } from 'recharts'
import { fitTransform, formatLapTime } from './TrackMap.jsx'
import { CHART, axisTick } from '../lib/chartTheme.js'

const teamSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_')

const G_TICKS = [-6, -4, -2, 0, 2, 4, 6]

// Friction-circle reference rings at 1..5 g, drawn as rings of dots so we
// only rely on Recharts' public Scatter API.
const RING_POINTS = (() => {
  const pts = []
  for (let g = 1; g <= 5; g++) {
    for (let a = 0; a < 360; a += 4) {
      const rad = (a * Math.PI) / 180
      pts.push({ x: g * Math.cos(rad), y: g * Math.sin(rad) })
    }
  }
  return pts
})()

// 0 → slate, 0.5 → amber, 1 → red
function gripColor(t) {
  const lerp = (a, b, f) => Math.round(a + (b - a) * f)
  const [c0, c1, f] =
    t < 0.5
      ? [[58, 63, 70], [255, 209, 102], t * 2]
      : [[255, 209, 102], [255, 59, 48], (t - 0.5) * 2]
  return `rgb(${lerp(c0[0], c1[0], f)},${lerp(c0[1], c1[1], f)},${lerp(c0[2], c1[2], f)})`
}

// Track map colored by combined grip utilization sqrt(lat^2 + long^2).
function GripMap({ channels }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const W = 380
    const H = 300
    const canvas = canvasRef.current
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const t = fitTransform(channels.x, channels.y, W, H, 16)
    ctx.clearRect(0, 0, W, H)
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    for (let i = 1; i < channels.x.length; i++) {
      const total = Math.hypot(channels.lat_g[i], channels.long_g[i])
      ctx.strokeStyle = gripColor(Math.min(total / 5, 1))
      ctx.beginPath()
      ctx.moveTo(t.toX(channels.x[i - 1]), t.toY(channels.y[i - 1]))
      ctx.lineTo(t.toX(channels.x[i]), t.toY(channels.y[i]))
      ctx.stroke()
    }
    ctx.strokeStyle = '#3a3f46'
    ctx.beginPath()
    ctx.moveTo(t.toX(channels.x[channels.x.length - 1]), t.toY(channels.y[channels.y.length - 1]))
    ctx.lineTo(t.toX(channels.x[0]), t.toY(channels.y[0]))
    ctx.stroke()
  }, [channels])

  return <canvas ref={canvasRef} className="board" style={{ width: 380, height: 300, maxWidth: '100%' }} />
}

export default function VehicleDynamics({ session }) {
  const codes = useMemo(() => Object.keys(session.drivers), [session])
  const [code, setCode] = useState(codes[0])

  const driver = session.drivers[code]
  const channels = driver.channels
  const corners = session.meta.corners ?? []

  const ggData = useMemo(
    () => channels.lat_g.map((lat, i) => ({ x: lat, y: channels.long_g[i] })),
    [channels],
  )

  // Contiguous braking zones (long_g < -1 g), heaviest first.
  const brakingZones = useMemo(() => {
    const zones = []
    let cur = null
    for (let i = 0; i < channels.long_g.length; i++) {
      if (channels.long_g[i] < -1) {
        if (!cur) cur = { peak: 0, dist: 0 }
        if (channels.long_g[i] < cur.peak) {
          cur.peak = channels.long_g[i]
          cur.dist = channels.distance[i]
        }
      } else if (cur) {
        zones.push(cur)
        cur = null
      }
    }
    if (cur) zones.push(cur)
    zones.sort((a, b) => a.peak - b.peak)
    return zones.slice(0, 5).map((z) => {
      // braking happens on the approach, so label with the next apex ahead
      const ahead = corners.filter((c) => c.distance > z.dist - 50)
      const corner = ahead.length && ahead[0].distance - z.dist < 400
        ? `T${ahead[0].number}${ahead[0].letter}`
        : '—'
      return { ...z, corner }
    })
  }, [channels, corners])

  const color = driver.team?.color || '#ff3b30'

  return (
    <div>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <label className="mono" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          Driver{' '}
          <select className="select" value={code} onChange={(e) => setCode(e.target.value)}>
            {codes.map((c) => (
              <option key={c} value={c}>
                {c} — {formatLapTime(session.drivers[c].lap_time)}
              </option>
            ))}
          </select>
          {driver.team?.name && (
            <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <img
                src={`/teams/${teamSlug(driver.team.name)}.svg`}
                alt=""
                style={{ width: 22, height: 22, flexShrink: 0 }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
              {driver.team.name}
            </span>
          )}
        </label>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div className="panel" style={{ flexShrink: 0 }}>
          <h2 className="panel-label">
            g-g diagram <span className="mark">/ friction circle, rings at 1-5 g</span>
          </h2>
          <ScatterChart width={440} height={440} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <XAxis
              dataKey="x"
              type="number"
              domain={[-6, 6]}
              ticks={G_TICKS}
              tick={axisTick}
              stroke={CHART.axis}
              label={{ value: 'lateral g', fill: '#7c8591', fontSize: 11, position: 'insideBottom', offset: -2 }}
            />
            <YAxis
              dataKey="y"
              type="number"
              domain={[-6, 6]}
              ticks={G_TICKS}
              tick={axisTick}
              width={40}
              stroke={CHART.axis}
              label={{ value: 'long g', fill: '#7c8591', fontSize: 11, angle: -90, position: 'insideLeft' }}
            />
            <Scatter
              data={RING_POINTS}
              isAnimationActive={false}
              shape={(p) => <circle cx={p.cx} cy={p.cy} r={0.7} fill="#2c313a" />}
            />
            <Scatter
              data={ggData}
              isAnimationActive={false}
              shape={(p) => <circle cx={p.cx} cy={p.cy} r={1.7} fill={color} fillOpacity={0.45} />}
            />
          </ScatterChart>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minWidth: 320 }}>
          <div className="panel">
            <h2 className="panel-label">
              Grip utilization <span className="mark">/ combined g along the lap</span>
            </h2>
            <GripMap channels={channels} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <span className="mono muted" style={{ fontSize: 11 }}>0</span>
              <span
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 4,
                  background: 'linear-gradient(90deg, rgb(58,63,70), rgb(255,209,102), rgb(255,59,48))',
                }}
              />
              <span className="mono muted" style={{ fontSize: 11 }}>≥5g combined</span>
            </div>
          </div>
          <div className="panel" style={{ flex: 1 }}>
            <h2 className="panel-label">Heaviest braking</h2>
            <table className="corner-table">
              <thead>
                <tr>
                  <th>Corner</th>
                  <th>Distance</th>
                  <th>Peak decel</th>
                </tr>
              </thead>
              <tbody>
                {brakingZones.map((z) => (
                  <tr key={z.dist}>
                    <td>{z.corner}</td>
                    <td>{Math.round(z.dist)} m</td>
                    <td className="loss">{z.peak.toFixed(2)} g</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="mono muted" style={{ fontSize: 12, marginTop: 14 }}>
        {(session.meta.caveats ?? []).join(' ')}
      </p>
    </div>
  )
}
