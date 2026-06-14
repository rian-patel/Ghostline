import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { loadSession, loadIndex } from './lib/loadSession.js'
import TrackMap from './components/TrackMap.jsx'
import useSmoothScroll from './lib/useSmoothScroll.js'
import Dropdown from './components/Dropdown.jsx'
import HeroTrack from './components/HeroTrack.jsx'
import CountUpTime from './components/CountUpTime.jsx'

// Replay is the landing view and stays eager. The other four each pull heavier
// deps (Recharts for three of them) and sit behind a tab click, so code-split
// them out of the initial bundle and load on demand.
const Pairwise = lazy(() => import('./components/Pairwise.jsx'))
const VehicleDynamics = lazy(() => import('./components/VehicleDynamics.jsx'))
const MiniSectors = lazy(() => import('./components/MiniSectors.jsx'))
const DrivingStyle = lazy(() => import('./components/DrivingStyle.jsx'))

const VIEWS = [
  { id: 'replay', label: 'Replay' },
  { id: 'pairwise', label: 'Pairwise' },
  { id: 'dynamics', label: 'Dynamics' },
  { id: 'sectors', label: 'Mini-sectors' },
  { id: 'style', label: 'Style' },
]

export default function App() {
  const [index, setIndex] = useState([])
  const [selected, setSelected] = useState(null)
  const [session, setSession] = useState(null)
  const [error, setError] = useState(null)
  const [view, setView] = useState('replay')
  const heroRef = useRef(null)
  const introPlayed = useRef(false)
  const tabsRef = useRef(null)
  const [ind, setInd] = useState({ left: 0, top: 0, width: 0, height: 0, ready: false })

  useSmoothScroll()

  // Position the sliding tab indicator under the active tab (and on resize).
  useLayoutEffect(() => {
    const measure = () => {
      const nav = tabsRef.current
      if (!nav) return
      const btn = nav.querySelector('.tab--active')
      if (btn) {
        setInd({
          left: btn.offsetLeft,
          top: btn.offsetTop,
          width: btn.offsetWidth,
          height: btn.offsetHeight,
          ready: true,
        })
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [view, session])

  // Load the session index once and pick a default (2026 Australian if present).
  useEffect(() => {
    loadIndex()
      .then((list) => {
        setIndex(list)
        // Suzuka's wide figure-8 fills the hero frame far better than most circuits.
        const def = list.find((s) => s.file === '2026_japanese_Q') || list[0]
        if (def) setSelected(def.file)
        else setError('No sessions found')
      })
      .catch((e) => setError(e.message))
  }, [])

  // Load whichever session is selected. Clear first so the views show their
  // own loading state instead of stale telemetry while the new file streams in
  // (the hero keeps rendering from the index meta the whole time).
  useEffect(() => {
    if (!selected) return
    setSession(null)
    loadSession(selected).then(setSession).catch((e) => setError(e.message))
  }, [selected])

  // One-time cinematic entry: the wordmark, pickers, and pole time resolve in.
  // Runs the first time the hero mounts (which is as soon as the lightweight
  // index loads, not the full session); skipped under reduced motion.
  // The pole time (the LCP element) reveals via transform+blur only — never
  // opacity 0 — so it counts as painted on first frame and doesn't delay LCP.
  useLayoutEffect(() => {
    if (introPlayed.current || !heroRef.current) return
    introPlayed.current = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
      tl.from('[data-anim="brand"]', { y: 22, autoAlpha: 0, duration: 0.7 }, 0.1)
        .from('[data-anim="pickers"]', { y: 12, autoAlpha: 0, duration: 0.6 }, 0.28)
        .from('[data-anim="eyebrow"]', { y: 14, autoAlpha: 0, duration: 0.6 }, 0.34)
        .from('[data-anim="time"]', { y: 30, filter: 'blur(14px)', duration: 0.95 }, 0.4)
        .from('[data-anim="driver"]', { y: 16, autoAlpha: 0, duration: 0.7 }, 0.56)
    }, heroRef)
  }, [selected])

  if (error) return <p className="status-note status-note--error">Could not load session: {error}</p>

  // Two-step picker: year, then race within that year.
  const current = index.find((s) => s.file === selected)
  if (!current) return <p className="status-note">Loading…</p>

  const years = [...new Set(index.map((s) => s.year))].sort((a, b) => b - a)
  const racesForYear = index
    .filter((s) => s.year === current.year)
    .sort((a, b) => a.round - b.round)
  const pickYear = (year) => {
    const first = index
      .filter((s) => s.year === Number(year))
      .sort((a, b) => a.round - b.round)[0]
    if (first) setSelected(first.file)
  }

  // The hero renders from `current` (the lightweight index entry, which already
  // carries pole_time/pole_driver), so it paints without waiting on the ~1.5MB
  // session JSON. The driver dot's team color is the one session-only field; it
  // falls back to the accent until the session arrives.
  const sessionName =
    { Q: 'Qualifying', SQ: 'Sprint Qualifying' }[current.session] || current.session
  const poleColor = session?.drivers?.[current.pole_driver]?.team?.color || 'var(--accent)'
  const yearOptions = years.map((y) => ({ value: String(y), label: String(y) }))
  const raceOptions = racesForYear.map((s) => ({ value: s.file, label: s.gp }))

  return (
    <>
      <div className="hero" ref={heroRef}>
        <div className="hero-fx" aria-hidden="true">
          {session && <HeroTrack session={session} />}
        </div>
        <div className="hero-inner">
          <div className="hero-content">
            <div className="brand" data-anim="brand">
              <img className="brand-mark" src="/brand/mark.png" width="52" height="52" alt="Ghostline logo" />
              <h1 className="wordmark" data-text="GHOSTLINE">
                GHOST<span className="line">LINE</span>
              </h1>
            </div>
            <div className="hero-pickers" data-anim="pickers">
              <span className="hero-pickers-label">Viewing</span>
              <Dropdown
                ariaLabel="Season"
                value={String(current?.year ?? '')}
                options={yearOptions}
                onChange={pickYear}
              />
              <Dropdown
                ariaLabel="Grand Prix"
                value={selected || ''}
                options={raceOptions}
                onChange={setSelected}
              />
            </div>
            <div className="hero-stat">
              <div className="hero-eyebrow" data-anim="eyebrow">
                Round {current.round} · {sessionName}
              </div>
              <div className="hero-pole">
                <div className="hero-time" data-anim="time">
                  <CountUpTime seconds={current.pole_time} />
                </div>
                <div className="hero-pole-meta" data-anim="driver">
                  <span className="hero-pole-tag">Pole Position</span>
                  <span className="hero-driver">
                    <span className="hero-driver-dot" style={{ background: poleColor }} />
                    {current.pole_driver}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="app">
        <nav className="tabs rise rise-1" ref={tabsRef} role="tablist" aria-label="Telemetry views">
          <span
            aria-hidden="true"
            className="tab-indicator"
            style={{
              left: ind.left,
              top: ind.top,
              width: ind.width,
              height: ind.height,
              opacity: ind.ready ? 1 : 0,
            }}
          />
          {VIEWS.map((v) => (
            <button
              key={v.id}
              id={`tab-${v.id}`}
              role="tab"
              aria-selected={view === v.id}
              aria-controls={`panel-${v.id}`}
              onClick={() => setView(v.id)}
              className={`tab${view === v.id ? ' tab--active' : ''}`}
            >
              {v.label}
            </button>
          ))}
        </nav>
        <main className="rise rise-2">
          <div
            key={`${current.file}_${view}`}
            className="view-fade"
            id={`panel-${view}`}
            role="tabpanel"
            aria-labelledby={`tab-${view}`}
          >
            {!session ? (
              <p className="status-note">Loading telemetry…</p>
            ) : (
              <Suspense fallback={<p className="status-note">Loading view…</p>}>
                {view === 'replay' && <TrackMap session={session} />}
                {view === 'pairwise' && <Pairwise session={session} />}
                {view === 'dynamics' && <VehicleDynamics session={session} />}
                {view === 'sectors' && <MiniSectors session={session} />}
                {view === 'style' && <DrivingStyle session={session} />}
              </Suspense>
            )}
          </div>
        </main>
      </div>
    </>
  )
}
