import { useEffect, useState } from 'react'
import { loadSession } from './lib/loadSession.js'
import TrackMap, { formatLapTime } from './components/TrackMap.jsx'
import Pairwise from './components/Pairwise.jsx'

const VIEWS = [
  { id: 'replay', label: 'Replay' },
  { id: 'pairwise', label: 'Pairwise' },
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
    <div className="app">
      <header className="masthead rise">
        <h1 className="wordmark" data-text="GHOSTLINE">
          GHOST<span className="line">LINE</span>
        </h1>
        <div className="session-meta">
          {session.meta.gp} {session.meta.year} · {session.meta.session} · POLE{' '}
          <b>{session.meta.pole_driver}</b>{' '}
          <span className="best">{formatLapTime(session.meta.pole_time)}</span>
        </div>
      </header>
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
        {view === 'replay' ? <TrackMap session={session} /> : <Pairwise session={session} />}
      </main>
    </div>
  )
}
