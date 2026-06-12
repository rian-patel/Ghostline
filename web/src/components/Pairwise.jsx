import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fitTransform, formatLapTime } from './TrackMap.jsx'

const COLOR_A = '#ff3b30'
const COLOR_B = '#fbbf24'
const GAIN_COLOR = '#4ade80'
const LOSS_COLOR = '#f87171'
const NEUTRAL_COLOR = '#3a3f46'
// Smoothed per-5m delta slope below this is shown as neutral (delta is
// rounded to 1ms, so tiny slopes are quantization noise).
const SLOPE_THRESHOLD = 0.0008

// Per-driver grids share the same 5m spacing but differ in length; reads
// past a driver's last sample clamp to it (their lap is over, the value
// holds), so comparisons run to the LONGER lap and end on each driver's
// own final delta — which is exact against official lap times.
const at = (arr, i) => arr[i < arr.length ? i : arr.length - 1]

const axisTick = { fill: '#6b7480', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }
const tooltipStyle = {
  contentStyle: {
    background: '#161a21',
    border: '1px solid #232830',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'IBM Plex Mono, monospace',
  },
  labelStyle: { color: '#8b939e' },
  labelFormatter: (d) => `${Math.round(d)} m`,
}

function ChannelChart({ data, keyA, keyB, codeA, codeB, label, type = 'linear', domain }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div className="panel-label" style={{ marginBottom: 6 }}>{label}</div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} syncId="pairwise" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#1d2129" strokeDasharray="3 3" />
          <XAxis
            dataKey="d"
            type="number"
            domain={[0, 'dataMax']}
            tick={axisTick}
            tickFormatter={(v) => `${Math.round(v)}m`}
            stroke="#232830"
          />
          <YAxis tick={axisTick} width={44} domain={domain} stroke="#232830" />
          <Tooltip {...tooltipStyle} />
          <Line type={type} dataKey={keyA} name={codeA} stroke={COLOR_A} dot={false} isAnimationActive={false} strokeWidth={1.5} />
          <Line type={type} dataKey={keyB} name={codeB} stroke={COLOR_B} dot={false} isAnimationActive={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// Track map colored by where A gains (green) or loses (red) time to B,
// based on the smoothed local slope of the delta curve.
function GainLossMap({ session, codeA, slopes }) {
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

    const ch = session.drivers[codeA].channels
    const t = fitTransform(ch.x, ch.y, W, H, 16)

    ctx.clearRect(0, 0, W, H)
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    for (let i = 1; i < slopes.length; i++) {
      const x0 = at(ch.x, i - 1)
      const y0 = at(ch.y, i - 1)
      const x1 = at(ch.x, i)
      const y1 = at(ch.y, i)
      if (x0 === x1 && y0 === y1) continue
      const s = slopes[i]
      ctx.strokeStyle = s > SLOPE_THRESHOLD ? GAIN_COLOR : s < -SLOPE_THRESHOLD ? LOSS_COLOR : NEUTRAL_COLOR
      ctx.beginPath()
      ctx.moveTo(t.toX(x0), t.toY(y0))
      ctx.lineTo(t.toX(x1), t.toY(y1))
      ctx.stroke()
    }
    // close the loop across the start/finish line in neutral
    ctx.strokeStyle = NEUTRAL_COLOR
    ctx.beginPath()
    ctx.moveTo(t.toX(ch.x[ch.x.length - 1]), t.toY(ch.y[ch.y.length - 1]))
    ctx.lineTo(t.toX(ch.x[0]), t.toY(ch.y[0]))
    ctx.stroke()
  }, [session, codeA, slopes])

  return <canvas ref={canvasRef} className="board" style={{ width: 380, height: 300, maxWidth: '100%' }} />
}

export default function Pairwise({ session }) {
  const codes = useMemo(
    () =>
      Object.entries(session.drivers)
        .sort((a, b) => a[1].lap_time - b[1].lap_time)
        .map(([code]) => code),
    [session],
  )

  const [codeA, setCodeA] = useState(codes[0])
  const [codeB, setCodeB] = useState(codes[1])

  // One combined data array on the shared 5m grid (indices align across
  // drivers; run to the longer of the two arrays with clamped reads).
  const data = useMemo(() => {
    const A = session.drivers[codeA].channels
    const B = session.drivers[codeB].channels
    const n = Math.max(A.distance.length, B.distance.length)
    const rows = new Array(n)
    for (let i = 0; i < n; i++) {
      rows[i] = {
        d: i * 5,
        delta: +(at(B.delta, i) - at(A.delta, i)).toFixed(3),
        speedA: at(A.speed, i),
        speedB: at(B.speed, i),
        throttleA: at(A.throttle, i),
        throttleB: at(B.throttle, i),
        brakeA: at(A.brake, i),
        brakeB: at(B.brake, i),
        gearA: at(A.gear, i),
        gearB: at(B.gear, i),
      }
    }
    return rows
  }, [session, codeA, codeB])

  // Smoothed per-step slope of the delta curve (rolling mean over +-2 steps).
  // Positive = B falling behind = A gaining.
  const slopes = useMemo(() => {
    const n = data.length
    const steps = new Array(n).fill(0)
    for (let i = 1; i < n; i++) steps[i] = data[i].delta - data[i - 1].delta
    const out = new Array(n).fill(0)
    for (let i = 1; i < n; i++) {
      let sum = 0
      let count = 0
      for (let k = Math.max(1, i - 2); k <= Math.min(n - 1, i + 2); k++) {
        sum += steps[k]
        count++
      }
      out[i] = sum / count
    }
    return out
  }, [data])

  const cornerRows = useMemo(() => {
    const corners = session.meta.corners ?? []
    if (!corners.length) return []
    const A = session.drivers[codeA].channels
    const B = session.drivers[codeB].channels
    const n = data.length
    const idxOf = (d) => Math.max(0, Math.min(n - 1, Math.round(d / 5)))
    // Each corner owns the stretch from the midpoint to the previous corner
    // up to the midpoint to the next one.
    const bounds = [0]
    for (let i = 1; i < corners.length; i++) {
      bounds.push((corners[i - 1].distance + corners[i].distance) / 2)
    }
    bounds.push((n - 1) * 5)
    return corners.map((c, i) => {
      const i0 = idxOf(bounds[i])
      const i1 = idxOf(bounds[i + 1])
      let minA = Infinity
      let minB = Infinity
      for (let k = i0; k <= i1; k++) {
        if (at(A.speed, k) < minA) minA = at(A.speed, k)
        if (at(B.speed, k) < minB) minB = at(B.speed, k)
      }
      const gained = data[i1].delta - data[i0].delta
      return { label: `T${c.number}${c.letter}`, minA, minB, gained: +gained.toFixed(3) }
    })
  }, [session, codeA, codeB, data])

  const corners = session.meta.corners ?? []

  return (
    <div>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <label className="mono" style={{ color: COLOR_A, fontSize: 13 }}>
          A{' '}
          <select className="select" value={codeA} onChange={(e) => setCodeA(e.target.value)}>
            {codes.map((c) => (
              <option key={c} value={c}>
                {c} — {formatLapTime(session.drivers[c].lap_time)}
              </option>
            ))}
          </select>
        </label>
        <label className="mono" style={{ color: COLOR_B, fontSize: 13 }}>
          B{' '}
          <select className="select" value={codeB} onChange={(e) => setCodeB(e.target.value)}>
            {codes.map((c) => (
              <option key={c} value={c}>
                {c} — {formatLapTime(session.drivers[c].lap_time)}
              </option>
            ))}
          </select>
        </label>
        <span className="mono muted" style={{ fontSize: 12 }}>
          positive Δt = {codeB} behind {codeA}
        </span>
      </div>

      <div className="panel">
        <h2 className="panel-label">
          Time delta <span className="mark">/ {codeB} − {codeA} (s) vs distance</span>
        </h2>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} syncId="pairwise" margin={{ top: 14, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#1d2129" strokeDasharray="3 3" />
            <XAxis
              dataKey="d"
              type="number"
              domain={[0, 'dataMax']}
              tick={axisTick}
              tickFormatter={(v) => `${Math.round(v)}m`}
              stroke="#232830"
            />
            <YAxis tick={axisTick} width={44} stroke="#232830" />
            <Tooltip {...tooltipStyle} />
            <ReferenceLine y={0} stroke="#5d6671" />
            {corners.map((c) => (
              <ReferenceLine
                key={`${c.number}${c.letter}`}
                x={c.distance}
                stroke="#262c35"
                label={{ value: `T${c.number}${c.letter}`, fill: '#5d6671', fontSize: 10, position: 'top' }}
              />
            ))}
            <Line type="linear" dataKey="delta" name={`Δt ${codeB}−${codeA}`} stroke="#c084fc" dot={false} isAnimationActive={false} strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <h2 className="panel-label">Telemetry traces</h2>
        <div style={{ marginTop: -18 }}>
          <ChannelChart data={data} keyA="speedA" keyB="speedB" codeA={codeA} codeB={codeB} label="Speed (km/h)" />
          <ChannelChart data={data} keyA="throttleA" keyB="throttleB" codeA={codeA} codeB={codeB} label="Throttle (%)" domain={[0, 100]} />
          <ChannelChart data={data} keyA="brakeA" keyB="brakeB" codeA={codeA} codeB={codeB} label="Brake (on/off)" type="stepAfter" domain={[0, 1]} />
          <ChannelChart data={data} keyA="gearA" keyB="gearB" codeA={codeA} codeB={codeB} label="Gear" type="stepAfter" domain={[1, 8]} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div className="panel" style={{ flexShrink: 0 }}>
          <h2 className="panel-label">
            Track map <span className="mark">/ <span className="gain">{codeA} gains</span> · <span className="loss">loses</span> vs {codeB}</span>
          </h2>
          <GainLossMap session={session} codeA={codeA} slopes={slopes} />
        </div>
        {cornerRows.length > 0 && (
          <div className="panel" style={{ flex: 1, minWidth: 320 }}>
            <h2 className="panel-label">Corner by corner</h2>
            <table className="corner-table">
              <thead>
                <tr>
                  <th>Corner</th>
                  <th>{codeA} min km/h</th>
                  <th>{codeB} min km/h</th>
                  <th>Δt for {codeA} (s)</th>
                </tr>
              </thead>
              <tbody>
                {cornerRows.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td>{r.minA}</td>
                    <td>{r.minB}</td>
                    <td className={r.gained > 0.005 ? 'gain' : r.gained < -0.005 ? 'loss' : 'muted'}>
                      {r.gained > 0 ? `+${r.gained.toFixed(3)}` : r.gained.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
