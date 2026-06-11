# Ghostline - Project Memory

## What this is
Browser-based F1 qualifying telemetry analysis. A Python pipeline (FastF1) precomputes one compact JSON per qualifying session. A Vite + React frontend loads those static JSONs and renders interactive visualizations. Deployed to Vercel (static site + one serverless function for an AI debrief).

## Golden rules
- Use the simplest approach that meets the spec. Do not add abstractions, helpers, or dependencies I did not ask for.
- One feature per session. Implement only what the current prompt asks.
- After any change, tell me the exact command to verify it and what correct output looks like.
- Never invent F1 numbers. The AI debrief narrates only precomputed values passed to it.
- Commit working states with clear messages when I ask. Do not add Co-Authored-By lines.

## Architecture
- pipeline/  Python 3.11. Package `ghostline`. Entry: build_session.py. FastF1 cache in pipeline/cache (gitignored).
- web/        Vite + React (JavaScript). Static. Reads JSON from web/public/sessions/.
- api/        Vercel serverless functions (Node). Only debrief.js. Holds ANTHROPIC_API_KEY server-side.
- Data flow: pipeline writes sessions/<year>_<gp>_<session>.json, copied into web/public/sessions/.

## Data format (JSON)
Compact columnar per driver: each channel is an array. Round positions to 0.1m, speed to 1 km/h, g-forces to 0.01, time to 0.001s. Common distance grid every 5m.

## FastF1 accuracy constraints (IMPORTANT)
- Position data is ~4-5 Hz, interpolated and jittery. Do NOT differentiate/integrate raw interpolated data carelessly.
- Compute curvature and g-forces on raw single-lap data, smoothing X/Y with scipy savgol_filter BEFORE differentiating, THEN resample onto the 5m grid.
- Lateral g = (speed_ms)^2 * curvature / 9.81 is reliable. Longitudinal g = d(speed_ms)/dt / 9.81 is approximate. Label it as such.
- X/Y from FastF1 are in 1/10 m (divide by 10 for meters).
- 2018+ only. No DRS/ERS/active-aero in the public 2026 feed.

## Tech choices (do not change without asking)
- Replay animation: HTML canvas (not SVG) for 20 cars at 60fps.
- Charts: Recharts.
- Python: fastf1, pandas, numpy, scipy, scikit-learn.

## Commands
- Repo root: D:\Ghostline. Python venv lives at pipeline/venv (Windows).
- Build a session: `pipeline\venv\Scripts\python.exe pipeline\build_session.py --year 2024 --gp "Bahrain" --session Q`
- Run frontend: `cd web` then `npm run dev`
- Build frontend: `cd web` then `npm run build`
