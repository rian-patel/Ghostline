import { useMemo, useState } from 'react'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { formatLapTime } from './TrackMap.jsx'
import { CHART, axisTick, tooltipStyle } from '../lib/chartTheme.js'

const teamSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_')

// Distinct hues for the KMeans clusters (style groups, not teams).
const CLUSTER_COLORS = ['#ff3b30', '#fbbf24', '#4ade80', '#60a5fa', '#c084fc']
const clusterColor = (c) => CLUSTER_COLORS[c % CLUSTER_COLORS.length]

const FEATURE_LABELS = {
  apex_speed: 'Apex speed',
  brake_point: 'Brake point',
  throttle_app: 'Throttle app.',
  exit_speed: 'Exit speed',
  trail_brake: 'Trail brake',
}

export default function DrivingStyle({ session }) {
  const style = session.meta.style
  const codes = useMemo(() => Object.keys(session.drivers), [session])
  const [code, setCode] = useState(codes[0])

  const featureNames = style?.feature_names ?? []

  // Per-feature min/max across the field, for 0..1 radar normalization.
  const ranges = useMemo(() => {
    const r = {}
    if (!style) return r
    featureNames.forEach((f) => {
      let lo = Infinity
      let hi = -Infinity
      codes.forEach((c) => {
        const v = style.drivers[c].radar[f]
        if (v < lo) lo = v
        if (v > hi) hi = v
      })
      r[f] = [lo, hi]
    })
    return r
  }, [style, codes, featureNames])

  // Scatter points grouped by cluster so each group draws in its own color.
  const clusters = useMemo(() => {
    const groups = {}
    if (!style) return groups
    codes.forEach((c) => {
      const d = style.drivers[c]
      ;(groups[d.cluster] ||= []).push({ x: d.pc[0], y: d.pc[1], code: c })
    })
    return groups
  }, [style, codes])

  const radarData = useMemo(() => {
    if (!style) return []
    return featureNames.map((f) => {
      const [lo, hi] = ranges[f]
      const raw = style.drivers[code].radar[f]
      const norm = hi > lo ? (raw - lo) / (hi - lo) : 0.5
      return { feature: FEATURE_LABELS[f] || f, value: +norm.toFixed(3), raw }
    })
  }, [style, code, ranges, featureNames])

  if (!style) {
    return <p className="status-note">No driving-style data in this session.</p>
  }

  const driver = session.drivers[code]
  const color = driver.team?.color || '#ff3b30'
  const clusterIds = Object.keys(clusters).map(Number).sort((a, b) => a - b)

  // Custom dot: label every car, enlarge + ring the selected one.
  const dot = (clusterId) => (props) => {
    const { cx, cy, payload } = props
    if (cx == null) return null
    const selected = payload.code === code
    return (
      <g style={{ cursor: 'pointer' }}>
        {selected && (
          <circle cx={cx} cy={cy} r={9} fill="none" stroke="#e9edf2" strokeWidth={1.5} />
        )}
        <circle cx={cx} cy={cy} r={selected ? 5.5 : 4} fill={clusterColor(clusterId)} stroke="#0b0e13" strokeWidth={1} />
        <text
          x={cx + 8}
          y={cy + 4}
          fill={selected ? '#e9edf2' : '#8b939e'}
          fontSize={10}
          fontFamily="IBM Plex Mono, monospace"
        >
          {payload.code}
        </text>
      </g>
    )
  }

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
        <span className="mono muted" style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, flexWrap: 'wrap' }}>
          {clusterIds.map((id) => (
            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className="legend-swatch" style={{ background: clusterColor(id) }} />
              Group {id + 1}
            </span>
          ))}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div className="panel" style={{ flexShrink: 0 }}>
          <h2 className="panel-label">
            Style space <span className="mark">/ PCA of corner features, colored by group</span>
          </h2>
          <ScatterChart width={460} height={420} margin={{ top: 8, right: 24, bottom: 20, left: 0 }}>
            <XAxis
              dataKey="x"
              type="number"
              tick={axisTick}
              stroke={CHART.axis}
              tickFormatter={(v) => v.toFixed(1)}
              label={{ value: 'PC1', fill: '#7c8591', fontSize: 11, position: 'insideBottom', offset: -8 }}
            />
            <YAxis
              dataKey="y"
              type="number"
              tick={axisTick}
              width={44}
              stroke={CHART.axis}
              tickFormatter={(v) => v.toFixed(1)}
              label={{ value: 'PC2', fill: '#7c8591', fontSize: 11, angle: -90, position: 'insideLeft' }}
            />
            <ZAxis range={[60, 60]} />
            {clusterIds.map((id) => (
              <Scatter
                key={id}
                data={clusters[id]}
                isAnimationActive={false}
                shape={dot(id)}
                onClick={(p) => p?.code && setCode(p.code)}
              />
            ))}
          </ScatterChart>
        </div>

        <div className="panel" style={{ flex: 1, minWidth: 320 }}>
          <h2 className="panel-label">
            Corner fingerprint <span className="mark">/ {code}, normalized vs field</span>
          </h2>
          <ResponsiveContainer width="100%" height={360}>
            <RadarChart data={radarData} outerRadius="72%">
              <PolarGrid stroke={CHART.grid} />
              <PolarAngleAxis dataKey="feature" tick={axisTick} />
              <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
              <Tooltip
                {...tooltipStyle}
                formatter={(v, _n, item) => [`${item.payload.raw} (rank ${(v * 100).toFixed(0)}%)`, item.payload.feature]}
              />
              <Radar
                dataKey="value"
                stroke={color}
                fill={color}
                fillOpacity={0.35}
                isAnimationActive={false}
              />
            </RadarChart>
          </ResponsiveContainer>
          <p className="mono muted" style={{ fontSize: 12, marginTop: 6 }}>
            Each axis is scaled 0–1 across the field (outer = field max). Brake/throttle
            points are metres relative to the apex; trail brake is metres braking while
            cornering.
          </p>
        </div>
      </div>
    </div>
  )
}
