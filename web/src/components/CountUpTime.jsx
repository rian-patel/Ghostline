import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { formatLapTime } from './TrackMap.jsx'

// Rolls a lap time up to its final value on mount / change — a settling-timer
// feel. Writes straight to the DOM node so it doesn't re-render per frame.
export default function CountUpTime({ seconds, className }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = formatLapTime(seconds)
      return
    }
    const o = { v: Math.max(0, seconds - 2.4) }
    el.textContent = formatLapTime(o.v)
    const tween = gsap.to(o, {
      v: seconds,
      duration: 1.2,
      delay: 0.35,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = formatLapTime(o.v)
      },
    })
    return () => tween.kill()
  }, [seconds])
  return <span ref={ref} className={className} />
}
