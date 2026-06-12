export async function loadSession(name = '2024_bahrain_Q') {
  const res = await fetch(`/sessions/${name}.json`)
  if (!res.ok) throw new Error(`Failed to load session ${name}: HTTP ${res.status}`)
  return res.json()
}
