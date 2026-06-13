import { useEffect, useState } from 'react'
import { loadSession, loadIndex } from './lib/loadSession.js'
import TrackMap, { formatLapTime } from './components/TrackMap.jsx'
import Pairwise from './components/Pairwise.jsx'
import VehicleDynamics from './components/VehicleDynamics.jsx'
import MiniSectors from './components/MiniSectors.jsx'
import DrivingStyle from './components/DrivingStyle.jsx'

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

  // Load the session index once and pick a default (Bahrain if present).
  useEffect(() => {
    loadIndex()
      .then((list) => {
        setIndex(list)
        const def = list.find((s) => s.file === '2024_bahrain_Q') || list[0]
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

  return (
    <>
      <div className="hero rise">
        <div className="hero-inner">
          <header className="masthead">
            <h1 className="wordmark" data-text="GHOSTLINE">
              GHOST<span className="line">LINE</span>
            </h1>
            <div className="session-meta">
              <select
                className="select"
                value={selected || ''}
                onChange={(e) => setSelected(e.target.value)}
              >
                {index.map((s) => (
                  <option key={s.file} value={s.file}>{s.gp} {s.year}</option>
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
