import { useEffect, useMemo, useRef, useState } from 'react'

const WIDTH = 800
const HEIGHT = 500
const PADDING = 24
const SPEEDS = [0.25, 0.5, 1, 2]

export function formatLapTime(seconds) {
  // Round to ms first so e.g. 59.9999 carries into the minute (1:00.000,
  // not 0:60.000).
  const total = Math.round(seconds * 1000) / 1000
  const m = Math.floor(total / 60)
  const s = (total - m * 60).toFixed(3).padStart(6, '0')
  return `${m}:${s}`
}

// Map track x/y (meters) onto a canvas: fit with padding, preserve aspect
// ratio, flip y (canvas y grows downward).
export function fitTransform(xs, ys, w, h, pad) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] < minX) minX = xs[i]
    if (xs[i] > maxX) maxX = xs[i]
    if (ys[i] < minY) minY = ys[i]
    if (ys[i] > maxY) maxY = ys[i]
  }
  const scale = Math.min((w - 2 * pad) / (maxX - minX), (h - 2 * pad) / (maxY - minY))
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return {
    toX: (x) => w / 2 + (x - cx) * scale,
    toY: (y) => h / 2 - (y - cy) * scale,
  }
}

// Linear interpolation of a driver's x/y/delta at elapsed lap time t,
// via binary search on the time channel. Clamps before the first and
// after the last sample (finished cars sit at the line).
function sampleAtTime(ch, t) {
  const time = ch.time
  const last = time.length - 1
  let lo, hi, f
  if (t <= time[0]) {
    lo = hi = 0
    f = 0
  } else if (t >= time[last]) {
    lo = hi = last
    f = 0
  } else {
    lo = 0
    hi = last
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (time[mid] <= t) lo = mid
      else hi = mid
    }
    const span = time[hi] - time[lo]
    f = span > 0 ? (t - time[lo]) / span : 0
  }
  return {
    x: ch.x[lo] + (ch.x[hi] - ch.x[lo]) * f,
    y: ch.y[lo] + (ch.y[hi] - ch.y[lo]) * f,
    delta: ch.delta[lo] + (ch.delta[hi] - ch.delta[lo]) * f,
  }
}

export default function TrackMap({ session }) {
  const canvasRef = useRef(null)
  const timeRef = useRef(0)
  const playingRef = useRef(false)
  const speedRef = useRef(1)
  const selectedRef = useRef(null)
  const transformRef = useRef(null)

  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [selected, setSelected] = useState(null)
  const [displayTime, setDisplayTime] = useState(0)

  playingRef.current = playing
  speedRef.current = speed
  selectedRef.current = selected

  const drivers = useMemo(
    () =>
      Object.entries(session.drivers)
        .sort((a, b) => a[1].lap_time - b[1].lap_time)
        .map(([code, d], i) => ({
          code,
          lapTime: d.lap_time,
          channels: d.channels,
          color: `hsl(${Math.round((i * 137.5) % 360)} 85% 62%)`,
        })),
    [session],
  )

  const maxTime = useMemo(
    () => Math.max(...drivers.map((d) => d.channels.time[d.channels.time.length - 1])),
    [drivers],
  )

  // Animation: per-frame drawing is imperative on the canvas; React state
  // (playing/speed/selected) is read through refs so the loop is created once.
  useEffect(() => {
    const canvas = canvasRef.current
    const dpr = window.devicePixelRatio || 1
    canvas.width = WIDTH * dpr
    canvas.height = HEIGHT * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const pole = drivers[0].channels
    const t = fitTransform(pole.x, pole.y, WIDTH, HEIGHT, PADDING)
    transformRef.current = t

    const trackPath = new Path2D()
    for (let i = 0; i < pole.x.length; i++) {
      const px = t.toX(pole.x[i])
      const py = t.toY(pole.y[i])
      if (i === 0) trackPath.moveTo(px, py)
      else trackPath.lineTo(px, py)
    }
    trackPath.closePath()

    const drawCar = (d, dim) => {
      const p = sampleAtTime(d.channels, timeRef.current)
      const sel = d.code === selectedRef.current
      ctx.globalAlpha = dim ? 0.25 : 1
      ctx.fillStyle = d.color
      ctx.beginPath()
      ctx.arc(t.toX(p.x), t.toY(p.y), sel ? 8 : 5, 0, Math.PI * 2)
      ctx.fill()
      if (sel) {
        ctx.strokeStyle = '#ff3b30'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }

    let raf
    let last = performance.now()
    const tick = (now) => {
      if (playingRef.current) {
        // Clamp the frame delta: rAF is suspended in hidden tabs, and an
        // unclamped delta would fast-forward the replay by wall-clock time.
        const next = Math.min(
          timeRef.current + (Math.min(now - last, 100) / 1000) * speedRef.current,
          maxTime,
        )
        timeRef.current = next
        setDisplayTime(next)
        if (next >= maxTime) setPlaying(false)
      }
      last = now

      ctx.clearRect(0, 0, WIDTH, HEIGHT)
      ctx.globalAlpha = 1
      ctx.strokeStyle = '#39404a'
      ctx.lineWidth = 2
      ctx.stroke(trackPath)

      const sel = selectedRef.current
      for (const d of drivers) {
        if (d.code !== sel) drawCar(d, sel !== null)
      }
      if (sel) {
        const selDriver = drivers.find((d) => d.code === sel)
        if (selDriver) drawCar(selDriver, false)
      }
      ctx.globalAlpha = 1

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [drivers, maxTime])

  const toggleSelect = (code) =>
    setSelected((prev) => (prev === code ? null : code))

  const onCanvasClick = (e) => {
    const t = transformRef.current
    const rect = canvasRef.current.getBoundingClientRect()
    // The canvas may be displayed smaller than its drawing size (flex layout),
    // so map mouse coordinates into drawing space.
    const mx = (e.clientX - rect.left) * (WIDTH / rect.width)
    const my = (e.clientY - rect.top) * (HEIGHT / rect.height)
    let best = null
    let bestDist = 12
    for (const d of drivers) {
      const p = sampleAtTime(d.channels, timeRef.current)
      const dist = Math.hypot(t.toX(p.x) - mx, t.toY(p.y) - my)
      if (dist < bestDist) {
        bestDist = dist
        best = d.code
      }
    }
    if (best === null) setSelected(null)
    else toggleSelect(best)
  }

  const onPlayPause = () => {
    if (!playing && timeRef.current >= maxTime) {
      timeRef.current = 0
      setDisplayTime(0)
    }
    setPlaying(!playing)
  }

  const onScrub = (e) => {
    const v = Number(e.target.value)
    timeRef.current = v
    setDisplayTime(v)
  }

  const tower = drivers
    .map((d) => ({ ...d, gap: sampleAtTime(d.channels, displayTime).delta }))
    .sort((a, b) => a.gap - b.gap || a.lapTime - b.lapTime)

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div className="panel" style={{ flexShrink: 1, minWidth: 0 }}>
        <h2 className="panel-label">
          Ghost replay <span className="mark">/ all laps start together</span>
        </h2>
        <canvas
          ref={canvasRef}
          onClick={onCanvasClick}
          className="board"
          style={{ width: WIDTH, height: HEIGHT, maxWidth: '100%', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <button onClick={onPlayPause} className="btn" style={{ minWidth: 72 }}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            className="scrub"
            min={0}
            max={maxTime}
            step={0.05}
            value={displayTime}
            onChange={onScrub}
          />
          <span className="mono muted" style={{ fontSize: 13, minWidth: 150, textAlign: 'right' }}>
            {formatLapTime(displayTime)} / {formatLapTime(maxTime)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`btn${s === speed ? ' btn--active' : ''}`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
      <div className="panel" style={{ minWidth: 230, flex: 1 }}>
        <h2 className="panel-label">Gap to fastest / live</h2>
        {tower.map((d, i) => {
          const cls = [
            'tower-row',
            d.code === selected ? 'tower-row--selected' : '',
            selected && d.code !== selected ? 'tower-row--dim' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <div key={d.code} onClick={() => toggleSelect(d.code)} className={cls}>
              <span className="tower-pos">{i + 1}</span>
              <span className="tower-dot" style={{ background: d.color }} />
              <span className="tower-code">{d.code}</span>
              <span className={`tower-gap${i === 0 ? ' tower-gap--best' : ''}`}>
                {d.gap > 0 ? `+${d.gap.toFixed(3)}` : d.gap.toFixed(3)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
