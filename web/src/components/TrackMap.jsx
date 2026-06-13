import { useEffect, useMemo, useRef, useState } from 'react'

const WIDTH = 800
const HEIGHT = 500
const PADDING = 24
const SPEEDS = [0.25, 0.5, 1, 2]
// Muted sector hues, distinct from the team-colored car dots.
const SECTOR_COLORS = ['#3f6c9e', '#9e7a3f', '#7a4f9e']

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

  const sectorsDist = session.meta.sectors ?? []

  // JSON driver order is the official classification, so drivers[0] is pole.
  // Dots use team colors; the second car of a team is drawn hollow.
  const drivers = useMemo(() => {
    const seen = {}
    return Object.entries(session.drivers).map(([code, d], i) => {
      const teamColor = d.team?.color || ''
      const nthOfTeam = teamColor ? (seen[teamColor] = (seen[teamColor] ?? 0) + 1) : 1
      return {
        code,
        lapTime: d.lap_time,
        channels: d.channels,
        color: teamColor || `hsl(${Math.round((i * 137.5) % 360)} 85% 62%)`,
        hollow: nthOfTeam > 1,
      }
    })
  }, [session])

  const maxTime = useMemo(
    () => Math.max(...drivers.map((d) => d.channels.time[d.channels.time.length - 1])),
    [drivers],
  )

  // Per-driver sector splits + the absolute lap time at which each car
  // crosses each sector boundary (so the tower can reveal splits live).
  const sectorInfo = useMemo(() => {
    if (sectorsDist.length !== 2) return null
    const per = {}
    const best = [Infinity, Infinity, Infinity]
    for (const d of drivers) {
      const time = d.channels.time
      const last = time.length - 1
      const tAt = (dist) => time[Math.min(Math.round(dist / 5), last)]
      const e1 = tAt(sectorsDist[0])
      const e2 = tAt(sectorsDist[1])
      const e3 = time[last]
      const splits = [e1 - time[0], e2 - e1, e3 - e2]
      per[d.code] = { ends: [e1, e2, e3], splits }
      splits.forEach((v, k) => {
        if (v < best[k]) best[k] = v
      })
    }
    return { per, best, pole: per[drivers[0].code].splits }
  }, [drivers, sectorsDist])

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
    const n = pole.x.length
    const idxAt = (d) => Math.max(0, Math.min(Math.round(d / 5), n - 1))

    // Split the closed track outline into colored sector arcs.
    const bounds =
      sectorsDist.length === 2
        ? [0, idxAt(sectorsDist[0]), idxAt(sectorsDist[1]), n - 1]
        : [0, n - 1]
    const sectorPaths = []
    for (let s = 0; s < bounds.length - 1; s++) {
      const p = new Path2D()
      for (let i = bounds[s]; i <= bounds[s + 1]; i++) {
        const px = t.toX(pole.x[i])
        const py = t.toY(pole.y[i])
        if (i === bounds[s]) p.moveTo(px, py)
        else p.lineTo(px, py)
      }
      sectorPaths.push(p)
    }

    // A perpendicular tick across the track at grid index i.
    const tickAt = (i, halfLen) => {
      const a = Math.max(0, i - 1)
      const b = Math.min(n - 1, i + 1)
      const cx = t.toX(pole.x[i])
      const cy = t.toY(pole.y[i])
      let hx = t.toX(pole.x[b]) - t.toX(pole.x[a])
      let hy = t.toY(pole.y[b]) - t.toY(pole.y[a])
      const hl = Math.hypot(hx, hy) || 1
      const px = -hy / hl
      const py = hx / hl
      return {
        cx,
        cy,
        x1: cx + px * halfLen,
        y1: cy + py * halfLen,
        x2: cx - px * halfLen,
        y2: cy - py * halfLen,
      }
    }
    const sfTick = tickAt(0, 13)
    const boundaryTicks =
      sectorsDist.length === 2
        ? [tickAt(idxAt(sectorsDist[0]), 9), tickAt(idxAt(sectorsDist[1]), 9)]
        : []

    const drawCar = (d, dim) => {
      const p = sampleAtTime(d.channels, timeRef.current)
      const sel = d.code === selectedRef.current
      ctx.globalAlpha = dim ? 0.25 : 1
      ctx.beginPath()
      ctx.arc(t.toX(p.x), t.toY(p.y), sel ? 8 : 5, 0, Math.PI * 2)
      if (d.hollow) {
        ctx.strokeStyle = d.color
        ctx.lineWidth = 2.5
        ctx.stroke()
      } else {
        ctx.fillStyle = d.color
        ctx.fill()
      }
      if (sel) {
        ctx.strokeStyle = '#ff3b30'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(t.toX(p.x), t.toY(p.y), 11, 0, Math.PI * 2)
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
      ctx.lineWidth = 3
      ctx.lineJoin = 'round'
      sectorPaths.forEach((p, s) => {
        ctx.strokeStyle = sectorsDist.length === 2 ? SECTOR_COLORS[s] : '#39404a'
        ctx.stroke(p)
      })

      // Sector boundary ticks, then the brighter start/finish line.
      ctx.lineWidth = 2
      boundaryTicks.forEach((tk, k) => {
        ctx.strokeStyle = SECTOR_COLORS[k + 1]
        ctx.beginPath()
        ctx.moveTo(tk.x1, tk.y1)
        ctx.lineTo(tk.x2, tk.y2)
        ctx.stroke()
      })
      ctx.strokeStyle = '#f3f4f6'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(sfTick.x1, sfTick.y1)
      ctx.lineTo(sfTick.x2, sfTick.y2)
      ctx.stroke()
      ctx.fillStyle = '#f3f4f6'
      ctx.font = '600 11px IBM Plex Mono, monospace'
      ctx.fillText('S/F', sfTick.cx + 8, sfTick.cy - 8)

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
  }, [drivers, maxTime, sectorsDist])

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

  // Sector cell color: purple = field best, green = at/under pole, red = slower.
  const secColor = (val, k) => {
    if (Math.abs(val - sectorInfo.best[k]) < 1e-6) return 'var(--best)'
    if (val <= sectorInfo.pole[k] + 1e-9) return 'var(--gain)'
    return 'var(--loss)'
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
      <div className="panel" style={{ minWidth: sectorInfo ? 340 : 230, flex: 1 }}>
        <h2 className="panel-label">Gap to pole / live</h2>
        {sectorInfo && (
          <div className="tower-head">
            <span style={{ width: 20 }} />
            <span style={{ width: 9 }} />
            <span style={{ width: 36 }} />
            <span className="tower-gap">GAP</span>
            {['S1', 'S2', 'S3'].map((s, k) => (
              <span key={s} className="tower-sec" style={{ color: SECTOR_COLORS[k] }}>
                {s}
              </span>
            ))}
          </div>
        )}
        {tower.map((d, i) => {
          const cls = [
            'tower-row',
            d.code === selected ? 'tower-row--selected' : '',
            selected && d.code !== selected ? 'tower-row--dim' : '',
          ]
            .filter(Boolean)
            .join(' ')
          const info = sectorInfo?.per[d.code]
          return (
            <div key={d.code} onClick={() => toggleSelect(d.code)} className={cls}>
              <span className="tower-pos">{i + 1}</span>
              <span
                className="tower-dot"
                style={
                  d.hollow
                    ? { background: 'transparent', border: `2px solid ${d.color}` }
                    : { background: d.color }
                }
              />
              <span className="tower-code">{d.code}</span>
              <span className={`tower-gap${i === 0 ? ' tower-gap--best' : ''}`}>
                {d.gap > 0 ? `+${d.gap.toFixed(3)}` : d.gap.toFixed(3)}
              </span>
              {info &&
                [0, 1, 2].map((k) => {
                  const done = displayTime >= info.ends[k]
                  return done ? (
                    <span key={k} className="tower-sec" style={{ color: secColor(info.splits[k], k) }}>
                      {info.splits[k].toFixed(3)}
                    </span>
                  ) : (
                    <span key={k} className="tower-sec tower-sec--pending">
                      —
                    </span>
                  )
                })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
