// Shared Recharts theme so every chart (Pairwise, Vehicle Dynamics) pulls its
// axes, grid, tooltip and series colors from one place. Mirrors the CSS tokens
// in index.css — Recharts needs JS values, so these are kept in sync by hand.

export const CHART = {
  grid: '#1c212a',
  axis: '#232830',
  zero: '#5d6671',
  ref: '#262c35',
  refLabel: '#5d6671',
}

export const axisTick = {
  fill: '#7c8591',
  fontSize: 11,
  fontFamily: 'IBM Plex Mono, monospace',
}

export const tooltipStyle = {
  contentStyle: {
    background: '#13171e',
    border: '1px solid #2c333d',
    borderRadius: 8,
    fontSize: 12,
    fontFamily: 'IBM Plex Mono, monospace',
    boxShadow: '0 8px 28px -10px rgba(0, 0, 0, 0.7)',
  },
  labelStyle: { color: '#8b939e' },
  cursor: { stroke: '#3a4250', strokeWidth: 1 },
}

// Series colors used across charts and canvas overlays.
export const SERIES = {
  a: '#ff3b30',
  b: '#fbbf24',
  delta: '#c084fc',
  gain: '#4ade80',
  loss: '#f87171',
  neutral: '#3a3f46',
}
