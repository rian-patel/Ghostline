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

const COLOR_A = '#5ecbff'
const COLOR_B = '#fbbf24'
const GAIN_COLOR = '#4ade80'
const LOSS_COLOR = '#f87171'
// Smoothed per-5m delta slope below this is shown as neutral (delta is
// rounded to 1ms, so tiny slopes are quantization noise).
const SLOPE_THRESHOLD = 0.0008

// Per-driver grids share the same 5m spacing but differ in length; reads
// past a driver's last sample clamp to it (their lap is over, the value
// holds), so comparisons run to the LONGER lap and end on each driver's
// own final delta — which is exact against official lap times.
const at = (arr, i) => arr[i < arr.length ? i : arr.length - 1]

const tooltipStyle = {
  contentStyle: { background: '#15181d', border: '1px solid #333', fontSize: 12 },
  labelStyle: { color: '#aaa' },
  labelFormatter: (d) => `${Math.round(d)} m`,
}

function ChannelChart({ data, keyA, keyB, codeA, codeB, label, type = 'linear', domain }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>{label}</div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} syncId="pairwise" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#23272e" strokeDasharray="3 3" />
          <XAxis
            dataKey="d"
            type="number"
            domain={[0, 'dataMax']}
            tick={{ fill: '#777', fontSize: 11 }}
            tickFormatter={(v) => `${Math.round(v)}m`}
          />
          <YAxis tick={{ fill: '#777', fontSize: 11 }} width={44} domain={domain} />
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
      ctx.strokeStyle = s > SLOPE_THRESHOLD ? GAIN_COLOR : s < -SLOPE_THRESHOLD ? LOSS_COLOR : '#3a3f46'
      ctx.beginPath()
      ctx.moveTo(t.toX(x0), t.toY(y0))
      ctx.lineTo(t.toX(x1), t.toY(y1))
      ctx.stroke()
    }
    // close the loop across the start/finish line in neutral
    ctx.strokeStyle = '#3a3f46'
    ctx.beginPath()
    ctx.moveTo(t.toX(ch.x[ch.x.length - 1]), t.toY(ch.y[ch.y.length - 1]))
    ctx.lineTo(t.toX(ch.x[0]), t.toY(ch.y[0]))
    ctx.stroke()
  }, [session, codeA, slopes])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: 380, height: 300, background: '#111', borderRadius: 8, flexShrink: 0 }}
    />
  )
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

  const selectStyle = {
    background: '#15181d',
    color: '#eee',
    border: '1px solid #333',
    borderRadius: 4,
    padding: '6px 10px',
    font: 'inherit',
  }

  const corners = session.meta.corners ?? []

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ color: COLOR_A }}>
          A{' '}
          <select value={codeA} onChange={(e) => setCodeA(e.target.value)} style={selectStyle}>
            {codes.map((c) => (
              <option key={c} value={c}>
                {c} — {formatLapTime(session.drivers[c].lap_time)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ color: COLOR_B }}>
          B{' '}
          <select value={codeB} onChange={(e) => setCodeB(e.target.value)} style={selectStyle}>
            {codes.map((c) => (
              <option key={c} value={c}>
                {c} — {formatLapTime(session.drivers[c].lap_time)}
              </option>
            ))}
          </select>
        </label>
        <span style={{ color: '#888', fontSize: 13 }}>
          Positive Δt = {codeB} behind {codeA}
        </span>
      </div>

      <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>
        Time delta {codeB} − {codeA} (s) vs distance
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} syncId="pairwise" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#23272e" strokeDasharray="3 3" />
          <XAxis
            dataKey="d"
            type="number"
            domain={[0, 'dataMax']}
            tick={{ fill: '#777', fontSize: 11 }}
            tickFormatter={(v) => `${Math.round(v)}m`}
          />
          <YAxis tick={{ fill: '#777', fontSize: 11 }} width={44} />
          <Tooltip {...tooltipStyle} />
          <ReferenceLine y={0} stroke="#888" />
          {corners.map((c) => (
            <ReferenceLine
              key={`${c.number}${c.letter}`}
              x={c.distance}
              stroke="#2c313a"
              label={{ value: `T${c.number}${c.letter}`, fill: '#666', fontSize: 10, position: 'top' }}
            />
          ))}
          <Line type="linear" dataKey="delta" name={`Δt ${codeB}−${codeA}`} stroke="#c084fc" dot={false} isAnimationActive={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>

      <ChannelChart data={data} keyA="speedA" keyB="speedB" codeA={codeA} codeB={codeB} label="Speed (km/h)" />
      <ChannelChart data={data} keyA="throttleA" keyB="throttleB" codeA={codeA} codeB={codeB} label="Throttle (%)" domain={[0, 100]} />
      <ChannelChart data={data} keyA="brakeA" keyB="brakeB" codeA={codeA} codeB={codeB} label="Brake (on/off)" type="stepAfter" domain={[0, 1]} />
      <ChannelChart data={data} keyA="gearA" keyB="gearB" codeA={codeA} codeB={codeB} label="Gear" type="stepAfter" domain={[1, 8]} />

      <div style={{ display: 'flex', gap: 24, marginTop: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>
            Where {codeA} gains (green) / loses (red) vs {codeB}
          </div>
          <GainLossMap session={session} codeA={codeA} slopes={slopes} />
        </div>
        {cornerRows.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>Corner by corner</div>
            <table style={{ borderCollapse: 'collapse', fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
              <thead>
                <tr style={{ color: '#888' }}>
                  <th style={{ textAlign: 'left', padding: '4px 12px 4px 0' }}>Corner</th>
                  <th style={{ textAlign: 'right', padding: '4px 12px' }}>{codeA} min (km/h)</th>
                  <th style={{ textAlign: 'right', padding: '4px 12px' }}>{codeB} min (km/h)</th>
                  <th style={{ textAlign: 'right', padding: '4px 0 4px 12px' }}>Δt for {codeA} (s)</th>
                </tr>
              </thead>
              <tbody>
                {cornerRows.map((r) => (
                  <tr key={r.label} style={{ borderTop: '1px solid #23272e' }}>
                    <td style={{ padding: '4px 12px 4px 0' }}>{r.label}</td>
                    <td style={{ textAlign: 'right', padding: '4px 12px' }}>{r.minA}</td>
                    <td style={{ textAlign: 'right', padding: '4px 12px' }}>{r.minB}</td>
                    <td
                      style={{
                        textAlign: 'right',
                        padding: '4px 0 4px 12px',
                        color: r.gained > 0.005 ? GAIN_COLOR : r.gained < -0.005 ? LOSS_COLOR : '#888',
                      }}
                    >
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
