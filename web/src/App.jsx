import { useEffect, useState } from 'react'
import { loadSession, loadIndex } from './lib/loadSession.js'
import TrackMap, { formatLapTime } from './components/TrackMap.jsx'
import Pairwise from './components/Pairwise.jsx'
import VehicleDynamics from './components/VehicleDynamics.jsx'
import MiniSectors from './components/MiniSectors.jsx'
import DrivingStyle from './components/DrivingStyle.jsx'
import useSmoothScroll from './lib/useSmoothScroll.js'

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

  useSmoothScroll()

  // Load the session index once and pick a default (2026 Australian if present).
  useEffect(() => {
    loadIndex()
      .then((list) => {
        setIndex(list)
        const def = list.find((s) => s.file === '2026_australian_Q') || list[0]
        if (def) setSelected(def.file)
        else setError('No sessions found')
      })
      .catch((e) => setError(e.message))
  }, [])

  // Load whichever session is selected.
  useEffect(() => {
    if (!selected) return
    loadSession(selected).then(setSession).catch((e) => setError(e.message))
  }, [selected])

  if (error) return <p className="status-note status-note--error">Could not load session: {error}</p>
  if (!session) return <p className="status-note">Loading session…</p>

  // Two-step picker: year, then race within that year.
  const current = index.find((s) => s.file === selected)
  const years = [...new Set(index.map((s) => s.year))].sort((a, b) => b - a)
  const racesForYear = index
    .filter((s) => s.year === current?.year)
    .sort((a, b) => a.round - b.round)
  const pickYear = (year) => {
    const first = index
      .filter((s) => s.year === Number(year))
      .sort((a, b) => a.round - b.round)[0]
    if (first) setSelected(first.file)
  }

  return (
    <>
      <div className="hero rise">
        <div className="hero-inner">
          <header className="masthead">
            <div className="brand">
              <img className="brand-mark" src="/brand/mark.png" width="52" height="52" alt="Ghostline logo" />
              <h1 className="wordmark" data-text="GHOSTLINE">
                GHOST<span className="line">LINE</span>
              </h1>
            </div>
            <div className="session-meta">
              <select
                className="select"
                value={current?.year ?? ''}
                onChange={(e) => pickYear(e.target.value)}
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>{' '}
              <select
                className="select"
                value={selected || ''}
                onChange={(e) => setSelected(e.target.value)}
              >
                {racesForYear.map((s) => (
                  <option key={s.file} value={s.file}>{s.gp}</option>
                ))}
              </select>{' '}
              · {session.meta.session} · POLE{' '}
              <b>{session.meta.pole_driver}</b>{' '}
              <span className="best">{formatLapTime(session.meta.pole_time)}</span>
            </div>
          </header>
        </div>
      </div>
      <div className="app">
        <nav className="tabs rise rise-1">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`tab${view === v.id ? ' tab--active' : ''}`}
          >
            {v.label}
          </button>
        ))}
        </nav>
        <main className="rise rise-2">
          <div key={`${session.meta.year}_${session.meta.gp}_${view}`} className="view-fade">
            {view === 'replay' && <TrackMap session={session} />}
            {view === 'pairwise' && <Pairwise session={session} />}
            {view === 'dynamics' && <VehicleDynamics session={session} />}
            {view === 'sectors' && <MiniSectors session={session} />}
            {view === 'style' && <DrivingStyle session={session} />}
          </div>
        </main>
      </div>
    </>
  )
}
