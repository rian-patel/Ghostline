# Ghostline

Ghostline is a browser-based F1 qualifying analysis app. For each qualifying session, a Python pipeline built on FastF1 takes every driver's fastest lap, resamples it onto a common distance grid, adds time deltas and derived vehicle dynamics, and writes one compact JSON file. A Vite + React frontend loads those static files and replays the whole field's fastest laps as synchronized ghost cars on a canvas track map, next to pairwise telemetry comparisons and physics-based analysis views. Unofficial project using the FastF1 library; not associated with Formula 1.

## Architecture

A monorepo with two halves and a one-way data flow:

- **`pipeline/`** (Python 3.11). The `ghostline` package downloads telemetry via FastF1, finds each driver's fastest lap, resamples it onto a common 5 m distance grid, and computes time delta to pole, vehicle dynamics (curvature, lateral/longitudinal g), mini-sector dominance, and driving-style features. `build_session.py` is the CLI entry point. The FastF1 download cache lives in `pipeline/cache/` (gitignored).
- **`web/`** (Vite + React, JavaScript). A static site that fetches the precomputed JSON from `web/public/sessions/` and renders five views: ghost replay (HTML canvas), pairwise deep-dive, vehicle dynamics (g-g diagram), mini-sector dominance, and driving-style fingerprints. Charts use Recharts.
- **Data flow.** The pipeline writes `web/public/sessions/<year>_<gp>_<session>.json` plus an `index.json` manifest. The frontend reads those files directly. There is no database and no backend.

## Pipeline setup

From the repo root (`D:\Ghostline`), create the virtual environment once and install the dependencies (`fastf1`, `pandas`, `numpy`, `scipy`, `scikit-learn`):

```powershell
python -m venv pipeline\venv
pipeline\venv\Scripts\Activate.ps1
pip install -r pipeline\requirements.txt
```

Build one session (writes the JSON into `web/public/sessions/` and refreshes `index.json`):

```powershell
pipeline\venv\Scripts\python.exe pipeline\build_session.py --year 2024 --gp "Bahrain" --session Q
```

Flags: `--year` and `--gp` are required, `--session` defaults to `Q`, `--out` defaults to `web/public/sessions`. The first run for a season downloads several hundred MB into `pipeline/cache/` and is slow; later runs hit the cache and are fast. Build against completed sessions (the 2024 season is the stable reference).

## Run and build the frontend

```powershell
cd web
npm install
npm run dev      # local dev server at http://localhost:5173
npm run build    # production build into web/dist
```

`npm run dev` reloads automatically as files change. The build copies `web/public/sessions/` straight into `web/dist/sessions/`, so any session you bake is included.

## Deploy to Vercel

The app is a static Vite site. `vercel.json` sets the build command and points the output at `web/dist`. To deploy with the Vercel CLI from the repo root:

```powershell
npm i -g vercel        # once
vercel login           # opens your browser
vercel                 # preview deploy at a temporary URL
vercel --prod          # promote to the production URL
```

For continuous deploys, connect the GitHub repository in the Vercel dashboard (Project, then Settings, then Git). After that, every `git push` to the default branch rebuilds and updates the live site automatically.

## FastF1 accuracy caveats

The public telemetry feed has real limits. The pipeline works around them instead of papering over them:

- Position data arrives at only about 4 to 5 Hz and is jittery; anything smoother is interpolation. X/Y are smoothed with a Savitzky-Golay filter before differentiating, and dynamics are computed on raw single-lap data before resampling onto the 5 m grid.
- **Lateral g** (`speed² · curvature / 9.81`) comes out realistic, around 4 to 6 g in fast corners, and is trustworthy. **Longitudinal g** (`d(speed)/dt / 9.81`) is approximate. FastF1's own maintainer notes it is hard to compute reliably from this feed, so the app labels it that way.
- Overlaying two different laps carries roughly ±10 m of position uncertainty, so the track map is for visualization. Timing math anchors to the reliable speed and time channels instead.
- 2018 and later seasons only. The 2026 public feed has no DRS, active-aero, or energy-deployment data.

## Credits

Built on [FastF1](https://github.com/theOehrly/Fast-F1). This is an unofficial project. It is not associated with, endorsed by, or affiliated with Formula 1, the FIA, or any team.
