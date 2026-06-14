import { useMemo, useRef, useLayoutEffect } from 'react'
import gsap from 'gsap'
import { fitTransform } from './TrackMap.jsx'

// SVG canvas units; aspect ratio is preserved by CSS sizing.
const W = 600
const H = 360
const PAD = 36

// The hero graphic: the actual circuit of the selected session, drawn from the
// pole lap's x/y, with a faint full outline, a glowing red racing line that
// traces on, and a ghost dot endlessly lapping the closed loop (seamless).
export default function HeroTrack({ session }) {
  const lineRef = useRef(null)

  const d = useMemo(() => {
    const pole =
      session.drivers[session.meta.pole_driver]?.channels ??
      Object.values(session.drivers)[0].channels
    const t = fitTransform(pole.x, pole.y, W, H, PAD)
    let s = ''
    for (let i = 0; i < pole.x.length; i++) {
      s += `${i === 0 ? 'M' : 'L'}${t.toX(pole.x[i]).toFixed(1)} ${t.toY(pole.y[i]).toFixed(1)}`
    }
    return `${s}Z`
  }, [session])

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Trace the red line on each time the circuit changes.
  useLayoutEffect(() => {
    if (reduced || !lineRef.current) return
    const len = lineRef.current.getTotalLength()
    gsap.fromTo(
      lineRef.current,
      { strokeDasharray: len, strokeDashoffset: len },
      { strokeDashoffset: 0, duration: 1.9, ease: 'power2.inOut' },
    )
  }, [d, reduced])

  const circuitKey = `${session.meta.year}-${session.meta.gp}`

  return (
    <svg
      className="hero-track"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <path className="hero-track-base" d={d} />
      <path className="hero-track-line" d={d} ref={lineRef} />
      {!reduced && (
        <circle key={circuitKey} className="hero-track-dot" r={3.4}>
          <animateMotion dur="9s" repeatCount="indefinite" rotate="auto" path={d} />
        </circle>
      )}
    </svg>
  )
}
