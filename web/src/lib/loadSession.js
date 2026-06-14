export async function loadSession(name = '2026_australian_Q') {
  const res = await fetch(`/sessions/${name}.json`)
  if (!res.ok) throw new Error(`Failed to load session ${name}: HTTP ${res.status}`)
  return res.json()
}

export async function loadIndex() {
  const res = await fetch('/sessions/index.json')
  if (!res.ok) throw new Error(`Failed to load session index: HTTP ${res.status}`)
  return res.json()
}
