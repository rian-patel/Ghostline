import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'

// 3D board pulls in three.js — code-split so it only loads when toggled on.
const Replay3D = lazy(() => import('./Replay3D.jsx'))

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
export function sampleAtTime(ch, t) {
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

// Continuous index into the shared 5 m grid from elapsed lap time (binary
// search on the driver's own time channel). Index i == distance i*5, identical
// across drivers, so an index maps to the same track location on any path.
export function indexAtTime(time, t) {
  const last = time.length - 1
  if (t <= time[0]) return 0
  if (t >= time[last]) return last
  let lo = 0
  let hi = last
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (time[mid] <= t) lo = mid
    else hi = mid
  }
  const span = time[hi] - time[lo]
  return lo + (span > 0 ? (t - time[lo]) / span : 0)
}

// Interpolated point on an x/y path at a fractional grid index.
function pathPointAt(xs, ys, fi) {
  const last = xs.length - 1
  const i = Math.min(Math.max(0, Math.floor(fi)), last)
  const j = Math.min(i + 1, last)
  const f = fi - i
  return { x: xs[i] + (xs[j] - xs[i]) * f, y: ys[i] + (ys[j] - ys[i]) * f }
}

// Where to DRAW a car: its own GPS line where the telemetry is sound, but
// snapped onto the reference (pole) path at the same distance when its raw
// point is wildly off (>25 m) — kills lap-start / telemetry glitches that would
// otherwise place a car far from where it actually is on track.
export function carDisplayPos(car, poleX, poleY, t) {
  const fi = indexAtTime(car.time, t)
  const own = pathPointAt(car.x, car.y, fi)
  const ref = pathPointAt(poleX, poleY, fi)
  const dx = own.x - ref.x
  const dy = own.y - ref.y
  return dx * dx + dy * dy > 625 ? ref : own
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
  // Up to two driver codes, in click order. Empty = show the whole field.
  const [selected, setSelected] = useState([])
  const [displayTime, setDisplayTime] = useState(0)
  const [mode, setMode] = useState('2d') // '2d' canvas | '3d' WebGL

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

  // Playback clock — single source of truth for time, independent of which
  // board (2D canvas / 3D WebGL) is showing. The boards just read timeRef.
  useEffect(() => {
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
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [maxTime])

  // 2D canvas board: imperative per-frame drawing, reading the shared clock.
  useEffect(() => {
    const canvas = canvasRef.current
    if (mode !== '2d' || !canvas) return
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

    // One closed outline, drawn as a thick double line (dark casing + light core).
    const trackPath = new Path2D()
    for (let i = 0; i < n; i++) {
      const px = t.toX(pole.x[i])
      const py = t.toY(pole.y[i])
      if (i === 0) trackPath.moveTo(px, py)
      else trackPath.lineTo(px, py)
    }
    trackPath.closePath()

    // Geometry at a grid index: canvas point, travel angle, cross-track unit
    // (px,py), and outward normal (ox,oy) away from the track centroid.
    const geomAt = (i) => {
      const a = Math.max(0, i - 1)
      const b = Math.min(n - 1, i + 1)
      const cx = t.toX(pole.x[i])
      const cy = t.toY(pole.y[i])
      const angle = Math.atan2(
        t.toY(pole.y[b]) - t.toY(pole.y[a]),
        t.toX(pole.x[b]) - t.toX(pole.x[a]),
      )
      let ox = cx - WIDTH / 2
      let oy = cy - HEIGHT / 2
      const ol = Math.hypot(ox, oy) || 1
      return {
        cx,
        cy,
        angle,
        px: -Math.sin(angle),
        py: Math.cos(angle),
        ox: ox / ol,
        oy: oy / ol,
      }
    }

    const sf = geomAt(0)
    const dividers =
      sectorsDist.length === 2
        ? [geomAt(idxAt(sectorsDist[0])), geomAt(idxAt(sectorsDist[1]))]
        : []
    const sectorLabels =
      sectorsDist.length === 2
        ? [
            [0, idxAt(sectorsDist[0])],
            [idxAt(sectorsDist[0]), idxAt(sectorsDist[1])],
            [idxAt(sectorsDist[1]), n - 1],
          ].map(([i0, i1], k) => {
            const g = geomAt(Math.round((i0 + i1) / 2))
            return { x: g.cx + g.ox * 16, y: g.cy + g.oy * 16, text: `S${k + 1}` }
          })
        : []

    const drawCar = (d) => {
      const p = carDisplayPos(d.channels, pole.x, pole.y, timeRef.current)
      const sel = selectedRef.current.includes(d.code)
      if (sel) {
        ctx.shadowColor = 'rgba(255, 59, 48, 0.75)'
        ctx.shadowBlur = 14
      }
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
      ctx.shadowBlur = 0
    }

    let raf
    const tick = () => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT)
      ctx.globalAlpha = 1
      ctx.lineJoin = 'round'
      // double-line track: dark casing, then a light core on top
      ctx.strokeStyle = '#2b3038'
      ctx.lineWidth = 6
      ctx.stroke(trackPath)
      ctx.strokeStyle = '#aab2bd'
      ctx.lineWidth = 2
      ctx.stroke(trackPath)

      // neutral lines separating the sectors
      ctx.strokeStyle = '#6f7783'
      ctx.lineWidth = 2
      dividers.forEach((g) => {
        ctx.beginPath()
        ctx.moveTo(g.cx + g.px * 10, g.cy + g.py * 10)
        ctx.lineTo(g.cx - g.px * 10, g.cy - g.py * 10)
        ctx.stroke()
      })

      // sector labels + S/F, identified by text rather than color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '600 10px IBM Plex Mono, monospace'
      ctx.fillStyle = '#8b939e'
      sectorLabels.forEach((l) => ctx.fillText(l.text, l.x, l.y))

      // checkered start/finish line, oriented across the track
      ctx.save()
      ctx.translate(sf.cx, sf.cy)
      ctx.rotate(sf.angle)
      const SQ = 4
      const ROWS = 2
      const COLS = 7
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#f3f4f6' : '#11141a'
          ctx.fillRect((-ROWS / 2 + r) * SQ, (-COLS / 2 + c) * SQ, SQ, SQ)
        }
      }
      ctx.restore()
      ctx.fillStyle = '#f3f4f6'
      ctx.fillText('S/F', sf.cx + sf.ox * 18, sf.cy + sf.oy * 18)
      ctx.textAlign = 'start'
      ctx.textBaseline = 'alphabetic'

      // With a selection active, draw only those cars (the rest are hidden);
      // otherwise the whole field.
      const sel = selectedRef.current
      const shown = sel.length ? drivers.filter((d) => sel.includes(d.code)) : drivers
      for (const d of shown) drawCar(d)
      ctx.globalAlpha = 1

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [drivers, maxTime, sectorsDist, mode])

  // Toggle a code in the selection, capping at two: a third pick drops the
  // oldest of the current pair.
  const toggleSelect = (code) =>
    setSelected((prev) =>
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : prev.length < 2
          ? [...prev, code]
          : [prev[1], code],
    )

  const onCanvasClick = (e) => {
    const t = transformRef.current
    const rect = canvasRef.current.getBoundingClientRect()
    // The canvas may be displayed smaller than its drawing size (flex layout),
    // so map mouse coordinates into drawing space.
    const mx = (e.clientX - rect.left) * (WIDTH / rect.width)
    const my = (e.clientY - rect.top) * (HEIGHT / rect.height)
    const pole = drivers[0].channels
    let best = null
    let bestDist = 12
    for (const d of drivers) {
      const p = carDisplayPos(d.channels, pole.x, pole.y, timeRef.current)
      const dist = Math.hypot(t.toX(p.x) - mx, t.toY(p.y) - my)
      if (dist < bestDist) {
        bestDist = dist
        best = d.code
      }
    }
    if (best === null) setSelected([])
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

  // Rank by live gap to pole (pos is the true running order), then float any
  // selected drivers to the top so a chosen pair sits together for comparison.
  // The selected-first sort is stable, so it preserves gap order within groups.
  const tower = drivers
    .map((d) => ({ ...d, gap: sampleAtTime(d.channels, displayTime).delta }))
    .sort((a, b) => a.gap - b.gap || a.lapTime - b.lapTime)
    .map((d, i) => ({ ...d, pos: i + 1 }))
    .sort(
      (a, b) =>
        (selected.includes(b.code) ? 1 : 0) - (selected.includes(a.code) ? 1 : 0),
    )

  return (
    <div className="replay-grid">
      <div className="panel replay-board">
        <h2 className="panel-label">
          Ghost replay{' '}
          <span className="mark">
            / {selected.length ? selected.join(' vs ') : 'all laps start together · click two to compare'}
          </span>
        </h2>
        {mode === '2d' ? (
          <canvas
            ref={canvasRef}
            onClick={onCanvasClick}
            className="board"
            role="img"
            aria-label={`Ghost replay of the ${session.meta.gp} circuit with ${drivers.length} cars. The gap-to-pole list on the right is keyboard-accessible and lets you pick two drivers to compare.`}
            style={{
              width: '100%',
              maxWidth: WIDTH,
              height: 'auto',
              aspectRatio: `${WIDTH} / ${HEIGHT}`,
              cursor: 'pointer',
            }}
          />
        ) : (
          <Suspense
            fallback={
              <div
                className="board"
                style={{
                  width: '100%',
                  maxWidth: WIDTH,
                  aspectRatio: `${WIDTH} / ${HEIGHT}`,
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--muted)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                }}
              >
                Loading 3D…
              </div>
            }
          >
            <div
              className="board"
              data-lenis-prevent
              style={{
                width: '100%',
                maxWidth: WIDTH,
                aspectRatio: `${WIDTH} / ${HEIGHT}`,
                overflow: 'hidden',
              }}
            >
              <Replay3D drivers={drivers} timeRef={timeRef} selected={selected} onToggle={toggleSelect} />
            </div>
          </Suspense>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={onPlayPause} className="btn" style={{ minWidth: 72 }} aria-label={playing ? 'Pause replay' : 'Play replay'}>
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
            aria-label="Scrub replay position"
            aria-valuetext={`${formatLapTime(displayTime)} of ${formatLapTime(maxTime)}`}
            style={{ '--pct': maxTime ? displayTime / maxTime : 0 }}
          />
          <span className="mono muted" style={{ fontSize: 13, minWidth: 150, textAlign: 'right' }}>
            {formatLapTime(displayTime)} / {formatLapTime(maxTime)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`btn${s === speed ? ' btn--active' : ''}`}
              aria-pressed={s === speed}
              aria-label={`${s} times speed`}
            >
              {s}x
            </button>
          ))}
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }} role="group" aria-label="Replay renderer">
            <button className={`btn${mode === '2d' ? ' btn--active' : ''}`} onClick={() => setMode('2d')} aria-pressed={mode === '2d'}>2D</button>
            <button className={`btn${mode === '3d' ? ' btn--active' : ''}`} onClick={() => setMode('3d')} aria-pressed={mode === '3d'}>3D</button>
          </div>
        </div>
      </div>
      <div className={`panel replay-tower${sectorInfo ? ' replay-tower--wide' : ''}`}>
        <h2 className="panel-label">Gap to pole / live</h2>
        {sectorInfo && (
          <div className="tower-head">
            <span style={{ width: 20 }} />
            <span style={{ width: 9 }} />
            <span style={{ width: 36 }} />
            <span className="tower-gap">GAP</span>
            {['S1', 'S2', 'S3'].map((s) => (
              <span key={s} className="tower-sec">
                {s}
              </span>
            ))}
          </div>
        )}
        {tower.map((d) => {
          const cls = [
            'tower-row',
            selected.includes(d.code) ? 'tower-row--selected' : '',
            selected.length && !selected.includes(d.code) ? 'tower-row--dim' : '',
          ]
            .filter(Boolean)
            .join(' ')
          const info = sectorInfo?.per[d.code]
          return (
            <div
              key={d.code}
              onClick={() => toggleSelect(d.code)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggleSelect(d.code)
                }
              }}
              role="button"
              tabIndex={0}
              aria-pressed={selected.includes(d.code)}
              aria-label={`P${d.pos} ${d.code}, gap ${d.gap > 0 ? '+' : ''}${d.gap.toFixed(3)} seconds. Select to compare.`}
              className={cls}
            >
              <span className="tower-pos">{d.pos}</span>
              <span
                className="tower-dot"
                style={
                  d.hollow
                    ? { background: 'transparent', border: `2px solid ${d.color}` }
                    : { background: d.color }
                }
              />
              <span className="tower-code">{d.code}</span>
              <span className={`tower-gap${d.pos === 1 ? ' tower-gap--best' : ''}`}>
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
