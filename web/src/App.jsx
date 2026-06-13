import { useEffect, useState } from 'react'
import { loadSession } from './lib/loadSession.js'
import TrackMap, { formatLapTime } from './components/TrackMap.jsx'
import Pairwise from './components/Pairwise.jsx'
import VehicleDynamics from './components/VehicleDynamics.jsx'
import MiniSectors from './components/MiniSectors.jsx'

const VIEWS = [
  { id: 'replay', label: 'Replay' },
  { id: 'pairwise', label: 'Pairwise' },
  { id: 'dynamics', label: 'Dynamics' },
  { id: 'sectors', label: 'Mini-sectors' },
]

export default function App() {
  const [session, setSession] = useState(null)
  const [error, setError] = useState(null)
  const [view, setView] = useState('replay')

  useEffect(() => {
    loadSession().then(setSession).catch((e) => setError(e.message))
  }, [])

  if (error) return <p className="status-note status-note--error">Could not load session: {error}</p>
  if (!session) return <p className="status-note">Loading session…</p>

  return (
    <>
      <div className="hero rise">
        <div className="hero-inner">
          <header className="masthead">
            <h1 className="wordmark" data-text="GHOSTLINE">
              GHOST<span className="line">LINE</span>
            </h1>
            <div className="session-meta">
              {session.meta.gp} {session.meta.year} · {session.meta.session} · POLE{' '}
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
          <div key={view} className="view-fade">
            {view === 'replay' && <TrackMap session={session} />}
            {view === 'pairwise' && <Pairwise session={session} />}
            {view === 'dynamics' && <VehicleDynamics session={session} />}
            {view === 'sectors' && <MiniSectors session={session} />}
          </div>
        </main>
      </div>
    </>
  )
}
