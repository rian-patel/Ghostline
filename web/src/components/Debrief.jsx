import { useMemo, useState } from 'react'

// Race-engineer debrief, built entirely from the precomputed findings in the
// session JSON. Every line is derived from computed telemetry (delta, speed,
// brake) with the numbers already filled in — no model, no guesses.
export default function Debrief({ session }) {
  const findings = session.meta.findings || []
  const codes = Object.keys(session.drivers)
  const [driver, setDriver] = useState('')

  const shown = useMemo(
    () => (driver ? findings.filter((f) => f.startsWith(driver + ' ')) : findings),
    [findings, driver],
  )

  if (findings.length === 0) {
    return <p className="status-note">No findings in this session to debrief.</p>
  }

  return (
    <div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 14, fontSize: 13, maxWidth: 640 }}>
        The biggest swings of the session, ranked. Each note is derived straight
        from the telemetry — the time gained or lost through a corner and the
        braking or apex-speed difference that explains it — measured against
        pole. Nothing here is estimated.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <label className="mono" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          Focus
          <select className="select" value={driver} onChange={(e) => setDriver(e.target.value)}>
            <option value="">Whole field</option>
            {codes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <span className="mono muted" style={{ fontSize: 11 }}>
          vs pole {session.meta.pole_driver}
        </span>
      </div>

      <div className="panel">
        <h2 className="panel-label">
          Engineer's read <span className="mark">/ {shown.length} {shown.length === 1 ? 'note' : 'notes'}</span>
        </h2>
        {shown.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            No standout corners for {driver} in this session's top findings.
          </p>
        ) : (
          <ol style={{ margin: 0, paddingLeft: 22 }}>
            {shown.map((f, i) => (
              <li key={i} className="mono" style={{ fontSize: 13, color: '#c7cdd5', lineHeight: 1.7 }}>{f}</li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
