import { useEffect, useState } from 'react'
import { loadSession } from './lib/loadSession.js'
import TrackMap, { formatLapTime } from './components/TrackMap.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadSession().then(setSession).catch((e) => setError(e.message))
  }, [])

  if (error) return <p style={{ color: '#f66', padding: 24 }}>Could not load session: {error}</p>
  if (!session) return <p style={{ color: '#aaa', padding: 24 }}>Loading session…</p>

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', color: '#eee', padding: 24 }}>
      <h1 style={{ margin: '0 0 4px' }}>Ghostline</h1>
      <p style={{ margin: '0 0 16px', color: '#aaa' }}>
        {session.meta.gp} {session.meta.year} — {session.meta.session} · Pole:{' '}
        {session.meta.pole_driver} {formatLapTime(session.meta.pole_time)}
      </p>
      <TrackMap session={session} />
    </div>
  )
}
