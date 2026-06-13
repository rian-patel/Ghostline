import { useMemo, useState } from 'react'
import { ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { formatLapTime } from './TrackMap.jsx'
import { CHART, axisTick, tooltipStyle } from '../lib/chartTheme.js'

const teamSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_')

// Each habit is framed so a fuller bar always means "more of this".
// dir +1: a higher raw number = more of the named trait; dir -1: lower = more.
const TRAITS = [
  { key: 'brake_point', label: 'Late braking', dir: -1,
    desc: (v) => `${v} m before apex`, hi: 'brakes very late', lo: 'brakes early' },
  { key: 'apex_speed', label: 'Corner speed', dir: 1,
    desc: (v) => `${v} km/h apex`, hi: 'carries lots of corner speed', lo: 'low minimum speed' },
  { key: 'throttle_app', label: 'Early throttle', dir: -1,
    desc: (v) => `${v} m after apex`, hi: 'gets on the power early', lo: 'waits to get on the power' },
  { key: 'exit_speed', label: 'Exit speed', dir: 1,
    desc: (v) => `${v} km/h exit`, hi: 'fires off the corners', lo: 'softer corner exits' },
  { key: 'trail_brake', label: 'Trail braking', dir: 1,
    desc: (v) => `${v} m`, hi: 'trails the brakes deep into the corner', lo: 'releases the brakes early' },
]

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function MapTip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div style={tooltipStyle.contentStyle}>
      <div style={{ color: p.color, fontWeight: 700 }}>{p.code}</div>
      <div style={{ color: '#8b939e', fontSize: 12 }}>brakes {p.brake} m before the apex</div>
      <div style={{ color: '#8b939e', fontSize: 12 }}>{p.y} km/h minimum corner speed</div>
    </div>
  )
}

export default function DrivingStyle({ session }) {
  const style = session.meta.style
  const codes = useMemo(() => Object.keys(session.drivers), [session])
  const [code, setCode] = useState(codes[0])

  // Per-feature field stats (min/max/mean) for ranking and normalization.
  const stats = useMemo(() => {
    const s = {}
    if (!style) return s
    style.feature_names.forEach((f) => {
      const vals = codes.map((c) => style.drivers[c].features[f])
      s[f] = {
        min: Math.min(...vals),
        max: Math.max(...vals),
        mean: vals.reduce((a, b) => a + b, 0) / vals.length,
      }
    })
    return s
  }, [style, codes])

  // Style-map points. X = braking "lateness" (further right = brakes later),
  // Y = minimum corner speed. Colored by team so dots are recognizable.
  const mapData = useMemo(() => {
    if (!style) return []
    const bMax = stats.brake_point.max
    return codes.map((c) => {
      const f = style.drivers[c].features
      return {
        code: c,
        x: +(bMax - f.brake_point).toFixed(1),
        y: f.apex_speed,
        brake: f.brake_point,
        color: session.drivers[c].team?.color || '#8b939e',
      }
    })
  }, [style, codes, stats, session])

  const avgX = useMemo(
    () => (mapData.length ? mapData.reduce((a, p) => a + p.x, 0) / mapData.length : 0),
    [mapData],
  )

  // Per-trait bars for the selected driver: normalized fill, field-average
  // marker, and the driver's rank in the field (1 = most of that trait).
  const traitRows = useMemo(() => {
    if (!style) return []
    return TRAITS.map((t) => {
      const { min, max, mean } = stats[t.key]
      const raw = style.drivers[code].features[t.key]
      const span = max > min ? max - min : 1
      const n0 = (raw - min) / span
      const a0 = (mean - min) / span
      const ranked = [...codes].sort((a, b) => {
        const ra = style.drivers[a].features[t.key]
        const rb = style.drivers[b].features[t.key]
        return t.dir > 0 ? rb - ra : ra - rb
      })
      return {
        ...t,
        raw,
        value: t.dir > 0 ? n0 : 1 - n0,
        avg: t.dir > 0 ? a0 : 1 - a0,
        rank: ranked.indexOf(code) + 1,
        n: codes.length,
      }
    })
  }, [style, code, stats, codes])

  if (!style) {
    return <p className="status-note">No driving-style data in this session.</p>
  }

  const driver = session.drivers[code]
  const color = driver.team?.color || '#ff3b30'
  const avgY = stats.apex_speed.mean

  // One-line summary: the two habits this driver is furthest from the field on.
  const standouts = [...traitRows]
    .sort((a, b) => Math.abs(b.value - b.avg) - Math.abs(a.value - a.avg))
    .slice(0, 2)
  const summary = standouts.map((t) => (t.value >= t.avg ? t.hi : t.lo)).join(', and ')

  const quadrant = (pos, title, sub) => (
    <div
      style={{
        position: 'absolute',
        maxWidth: 150,
        pointerEvents: 'none',
        background: 'rgba(11,14,19,0.7)',
        padding: '2px 6px',
        borderRadius: 4,
        ...pos,
      }}
    >
      <div className="mono" style={{ fontSize: 11, color: '#9aa3ae', fontWeight: 700 }}>{title}</div>
      <div className="mono" style={{ fontSize: 10, color: '#5d6671' }}>{sub}</div>
    </div>
  )

  return (
    <div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 14, fontSize: 13, maxWidth: 640 }}>
        Where each driver sits by how they attack the corners — left to right is how late
        they brake, bottom to top is how much speed they carry. Pick a driver for their full
        habit profile.
      </p>

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
            Style map <span className="mark">/ braking vs corner speed</span>
          </h2>
          <div style={{ position: 'relative', width: 480, height: 440, maxWidth: '100%' }}>
            {quadrant({ top: 12, left: 54 }, 'Smooth', 'early brake · high speed')}
            {quadrant({ top: 12, right: 14, textAlign: 'right' }, 'Committed', 'late brake · high speed')}
            {quadrant({ bottom: 66, left: 54 }, 'Conservative', 'early brake · low speed')}
            {quadrant({ bottom: 66, right: 14, textAlign: 'right' }, 'Point & shoot', 'late brake · low speed')}
            <ScatterChart width={480} height={440} margin={{ top: 16, right: 24, bottom: 30, left: 8 }}>
              <XAxis
                dataKey="x"
                type="number"
                domain={[-0.5, 'dataMax + 1']}
                tick={axisTick}
                stroke={CHART.axis}
                tickFormatter={(v) => v.toFixed(0)}
                label={{ value: 'brakes later  ▸', fill: '#7c8591', fontSize: 11, position: 'insideBottom', offset: -6 }}
              />
              <YAxis
                dataKey="y"
                type="number"
                domain={['dataMin - 1', 'dataMax + 1']}
                tick={axisTick}
                width={44}
                stroke={CHART.axis}
                tickFormatter={(v) => v.toFixed(0)}
                label={{ value: 'corner speed ▴', fill: '#7c8591', fontSize: 11, angle: -90, position: 'insideLeft' }}
              />
              <ReferenceLine x={avgX} stroke={CHART.ref} strokeDasharray="4 4" />
              <ReferenceLine y={avgY} stroke={CHART.ref} strokeDasharray="4 4" />
              <Tooltip content={<MapTip />} cursor={{ stroke: '#3a4250' }} />
              <Scatter
                data={mapData}
                isAnimationActive={false}
                onClick={(p) => p?.code && setCode(p.code)}
                shape={(props) => {
                  const { cx, cy, payload } = props
                  if (cx == null) return null
                  const sel = payload.code === code
                  return (
                    <g style={{ cursor: 'pointer' }}>
                      {sel && <circle cx={cx} cy={cy} r={9} fill="none" stroke="#e9edf2" strokeWidth={1.5} />}
                      <circle cx={cx} cy={cy} r={sel ? 6 : 4.5} fill={payload.color} stroke="#0b0e13" strokeWidth={1} />
                      <text x={cx + 8} y={cy + 4} fill={sel ? '#e9edf2' : '#9aa3ae'} fontSize={10} fontFamily="IBM Plex Mono, monospace">
                        {payload.code}
                      </text>
                    </g>
                  )
                }}
              />
            </ScatterChart>
          </div>
          <p className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>
            Dashed lines = field average. Corner speed partly reflects car pace; the bars
            isolate driver habits.
          </p>
        </div>

        <div className="panel" style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column' }}>
          <h2 className="panel-label">
            {code} habit profile <span className="mark">/ ranked across the field</span>
          </h2>
          <p style={{ fontSize: 13, color: '#c5ccd4', margin: '2px 0 14px' }}>
            <b style={{ color }}>{code}</b> {summary}.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {traitRows.map((t) => (
              <div key={t.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                  <span className="mono" style={{ fontSize: 12, color: '#e9edf2' }}>{t.label}</span>
                  <span className="mono muted" style={{ fontSize: 11 }}>
                    {t.desc(t.raw)} · {ordinal(t.rank)} of {t.n}
                  </span>
                </div>
                <div style={{ position: 'relative', height: 10, borderRadius: 5, background: '#1c212a' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${Math.max(2, t.value * 100)}%`,
                      borderRadius: 5,
                      background: color,
                    }}
                  />
                  <div
                    title="field average"
                    style={{
                      position: 'absolute',
                      left: `${t.avg * 100}%`,
                      top: -2,
                      bottom: -2,
                      width: 2,
                      background: '#e9edf2',
                      opacity: 0.6,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mono muted" style={{ fontSize: 11, marginTop: 'auto', paddingTop: 14 }}>
            Bar = where {code} ranks between the slowest and fastest in the field for each
            habit; white tick = field average.
          </p>
        </div>
      </div>
    </div>
  )
}
