# Ghostline

**Browser-based F1 qualifying telemetry analysis. A physics-aware Python pipeline turns one qualifying session into a compact data file, and a 60fps canvas frontend replays the whole field's fastest laps as synchronized ghost cars next to four linked analysis views.**

Ghostline downloads official F1 timing and telemetry with [FastF1](https://github.com/theOehrly/Fast-F1), picks every driver's fastest qualifying lap, and precomputes everything offline into one small JSON per session: position, speed, throttle, brake, gear, time delta to pole, and derived vehicle dynamics (curvature, lateral and longitudinal g). The React frontend loads those static files and renders five interactive views with no server, no database, and no live API calls. Every number on screen comes from the precomputed file; the app never invents data, and it is explicit about where the underlying telemetry is and is not trustworthy.

The whole thing is built around the hard limits of the public data. Position samples arrive at only about 4 to 5 Hz and are jittery, so the pipeline smooths before it differentiates, computes physics on raw single-lap data before resampling, caps curvature so position jitter cannot fake impossible g-loads, and anchors all timing math to the reliable speed and time channels. Honest treatment of those limits is a design goal, not a footnote.

**Live demo:** [ghostline-eight.vercel.app](https://ghostline-eight.vercel.app/)

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [How the pipeline computes it](#how-the-pipeline-computes-it)
- [Data format](#data-format)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Pipeline setup](#pipeline-setup)
- [Run and build the frontend](#run-and-build-the-frontend)
- [Deploy to Vercel](#deploy-to-vercel)
- [Adding more sessions](#adding-more-sessions)
- [FastF1 accuracy caveats](#fastf1-accuracy-caveats)
- [Credits](#credits)

## Features

Each view is a self-contained read of the same precomputed session, switchable from a tab bar with a two-step year and race picker. The current build ships five 2024 and 2026 qualifying sessions (Bahrain, Miami, Monaco, Italy, and the 2026 Australian round) with the full 20 to 22 car field.

### Ghost replay

All fastest laps animate at once as dots on a canvas track map, every car starting its lap at `t = 0` so you watch the field fan out in real time exactly as the timing gaps describe. Built imperatively with `requestAnimationFrame` and refs (React state stays out of the per-frame path) so it holds 60fps with the whole grid, and the frame delta is clamped so a backgrounded tab cannot fast-forward the replay.

- Play, pause, scrub, and 0.25x to 2x speed control.
- A live gap tower ranks drivers by their current cumulative time to pole and reorders as gaps grow.
- Each driver's sector splits reveal in the tower as their car crosses each boundary, colored purple for field best, green for at or under pole, red for slower.
- Cars are drawn in team colors, with a team's second car hollow so teammates are distinguishable; click any car or tower row to spotlight it and dim the rest.
- The track is drawn with sector dividers, sector labels, and a checkered start/finish line oriented across the circuit.

### Pairwise deep dive

Pick any two drivers and compare them aligned by distance, not by time, so the same point on track lines up across both laps.

- A time-delta curve (driver B minus driver A) with a zero reference line and every corner marked.
- Overlaid speed, throttle, brake, and gear traces on a shared, synchronized distance axis.
- A track map painted green where A is gaining on B and red where A is losing, from the smoothed local slope of the delta curve.
- A corner-by-corner table: minimum speed for each driver, corner shape (V or U), and time gained or lost through that corner.

### Vehicle dynamics

A single-driver physics view built around the friction circle.

- A g-g diagram scattering lateral against longitudinal g for every point on the lap, with reference rings at 1 to 5 g.
- A grip-utilization track map colored by combined g load, `sqrt(lat_g² + long_g²)`, so the hardest-worked corners glow hottest.
- A ranked table of the heaviest braking zones with peak deceleration and the corner each zone feeds into.
- An on-screen disclaimer that longitudinal g is approximate and position data is about 4 to 5 Hz interpolated.

### Mini-sector dominance

The lap is cut into micro-segments anchored on detected corner apexes (35 segments for Bahrain, tunable to the 25 to 40 range).

- The track map becomes a patchwork colored by which driver of the full field owns each segment, with a legend counting segment wins.
- A composite ideal lap stitches the fastest segment times across the field into a single theoretical best that no individual lap achieved, shown against the actual pole time.
- Segment timing is read from each driver's delta channel, which sidesteps the small per-driver differences in measured lap length.

### Driving style

Five named, explainable corner habits per driver, each measured relative to the corner apex so it describes how a driver attacks the corner rather than where the corner sits on track. There is no opaque clustering: every axis a viewer sees maps to one real, named number.

- A style map placing each driver by how late they brake against how much corner speed they carry, split into Smooth, Committed, Conservative, and Point-and-shoot quadrants with field-average crosshairs.
- A per-driver habit profile: late braking, corner speed, early throttle, exit speed, and trail braking, each shown as a bar ranked across the field with the field average marked and the driver's rank called out.
- A one-line summary naming the two habits where the selected driver is furthest from the field.

## Architecture

A monorepo with two halves and a one-way data flow. The pipeline runs offline and produces static files; the frontend only ever reads them.

```
                     OFFLINE  (Python, once per session)
  +------------------------------------------------------------------+
  |  FastF1 timing + telemetry                                       |
  |       |                                                          |
  |       v                                                          |
  |  load.py       pick each driver's fastest valid lap (Q3>Q2>Q1)   |
  |       v                                                          |
  |  resample.py   raw car + position data onto a common 5 m grid    |
  |       v                                                          |
  |  dynamics.py   smooth X/Y, then curvature, lateral & long. g     |
  |       v                                                          |
  |  delta.py      cumulative time gap to pole along the lap         |
  |       v                                                          |
  |  features.py   mini-sector winners, corner shapes, style traits  |
  |       v                                                          |
  |  export.py     one compact columnar JSON  (~0.8 to 1.4 MB)       |
  +------------------------------------------------------------------+
                               |
                               |  web/public/sessions/<year>_<gp>_Q.json
                               v
                     BROWSER  (React + Vite, static on Vercel)
  +------------------------------------------------------------------+
  |  App.jsx     year / race picker  ·  five analysis tabs           |
  +-----------+-----------+-----------+--------------+---------------+
  |  Replay   | Pairwise  | Dynamics  | Mini-sectors |    Style      |
  |  60fps    | delta +   | g-g       | dominance    |  habit map    |
  |  canvas   | traces    | friction  | patchwork    |  + ranked     |
  |  gap tower| gain/loss | circle    | composite    |  habit bars   |
  +-----------+-----------+-----------+--------------+---------------+
```

The two halves are deliberately decoupled. The pipeline can change how it computes a channel without the frontend knowing, as long as the JSON shape holds, and the frontend can be developed against committed sample sessions without ever running Python.

## How the pipeline computes it

The accuracy discipline is the substance of this project, so it is worth stating what actually happens to the data.

- **Lap selection.** For each driver, `load.py` reads the official classification order and takes the fastest valid lap from the furthest qualifying segment they reached (Q3 if they made it, otherwise Q2, otherwise Q1), falling back to an earlier segment if the final one has no usable lap. The pole entry is the first classified driver.
- **Resampling.** Position samples arrive on their own clock, so `resample.py` maps each one to a lap distance through the car-data time-to-distance relation, then interpolates X, Y, speed, throttle, brake, gear, and time onto a common grid every 5 m. Continuous channels use linear interpolation; gear and brake use nearest-neighbor. FastF1's X/Y, which arrive in tenths of a meter, are converted to meters.
- **Curvature and g, in the right order.** `dynamics.py` works on the raw single lap. It smooths X and Y in meters with a Savitzky-Golay filter (window 11, polyorder 3, sized for the roughly 4 Hz feed) before taking any derivative, computes signed curvature `k = (x'·y'' - y'·x'') / (x'² + y'²)^1.5` against distance rather than sample index, smooths the curvature once more, then resamples onto the 5 m grid last. Lateral g is `speed² · k / 9.81`. Longitudinal g is `d(speed)/dt / 9.81`, smoothed after differentiating.
- **Killing jitter spikes.** Twice-differentiating a 4 Hz position trace leaves ripple that, multiplied by `speed²`, would imply tens of g on a straight. Curvature is capped per point at `7g / speed²`, which is loose at low speed (real hairpins survive untouched) and tight at high speed (where any large curvature must be noise). Both g channels are clipped to a 7 g physical ceiling.
- **Time delta to pole.** `delta.py` integrates `1 / speed` over distance to get cumulative lap time, then rescales each lap so its total equals the exact official lap time (this corrects the small drift from integrating measured speed). Two laps are aligned by fraction of lap completed, so the delta at the finish line equals the official lap-time gap exactly.
- **Mini-sectors and styles.** `features.py` finds corner apexes as peaks of absolute curvature, builds segment boundaries at the midpoints between apexes (splitting any segment longer than 200 m), and picks the per-segment winner from the delta channel. It also extracts the five style features per corner and classifies each corner V or U from how flat the floor of its speed dip is.
- **Export.** `export.py` writes a compact columnar JSON with hard rounding: positions and distance to 0.1 m, speed and throttle to whole numbers, brake to 0/1, gear to integers, time and delta to 0.001 s, curvature to 0.0001, g to 0.01. It also regenerates `index.json`, the manifest the frontend picker reads.

## Data format

One file per session, columnar so each channel is a single array and labels are not repeated per point. Numbers are rounded to the precision the source data actually supports. A session runs roughly 0.8 to 1.4 MB on disk and is served gzipped by Vercel.

```jsonc
{
  "meta": {
    "year": 2024, "gp": "Bahrain", "session": "Q",
    "track_length": 5345.0,
    "pole_driver": "VER", "pole_time": 89.179,
    "corners":     [{ "number": 1, "letter": "", "distance": 540.3, "shape": "U" }],
    "sectors":     [1879.0, 3640.5],
    "minisectors": { "boundaries": [0.0, 175.0], "winners": ["VER"], "composite_ideal": 88.94 },
    "style":       { "feature_names": ["apex_speed", "brake_point", "throttle_app",
                                       "exit_speed", "trail_brake"],
                     "drivers": { "VER": { "features": { "apex_speed": 118.4 } } } },
    "caveats":     ["Longitudinal g is approximate: derived by differentiating speed.", "..."]
  },
  "drivers": {
    "VER": {
      "lap_time": 89.179,
      "team": { "name": "Red Bull Racing", "color": "#3671c6" },
      "channels": {
        "distance": [], "x": [], "y": [],
        "speed": [], "throttle": [], "brake": [], "gear": [],
        "time": [], "delta": [],
        "curvature": [], "lat_g": [], "long_g": []
      }
    }
  }
}
```

Drivers are stored in official classification order, so `drivers[0]` is pole. Every channel array shares the same 5 m grid within a driver; lengths differ slightly between drivers because lap distances differ by a few meters, and the frontend clamps reads past a driver's last sample.

## Tech stack

### Frontend

| Library | Version | Purpose |
|---|---|---|
| react / react-dom | 19.2.7 | UI rendering and view state |
| recharts | 3.8.1 | Delta and telemetry line charts, g-g scatter, style scatter |
| vite | 8.0.16 | Dev server and production bundler |
| @vitejs/plugin-react | 6.0.2 | React fast refresh and JSX transform |
| HTML Canvas 2D | native | Ghost replay and every track map (no SVG, for 60fps with the full field) |

### Pipeline (Python 3.11)

| Library | Purpose |
|---|---|
| fastf1 | Official F1 timing and telemetry source, with on-disk caching |
| numpy | Arrays, gradients, interpolation, the curvature math |
| pandas | FastF1 returns lap and telemetry data as DataFrames |
| scipy | `savgol_filter` smoothing, nearest-neighbor interpolation, apex peak finding |
| scikit-learn | Installed for clustering experiments; the shipped style view uses named, explainable features instead |

### Hosting

| Service | Purpose |
|---|---|
| Vercel (Hobby) | Static build, global CDN, automatic HTTPS, auto-deploy on git push |

There is no backend, no database, and no API key in the deployed app.

## Repository layout

```
Ghostline/
├── pipeline/
│   ├── ghostline/
│   │   ├── load.py        # session load + fastest-lap selection per quali segment
│   │   ├── resample.py    # raw car + position telemetry onto a common 5 m grid
│   │   ├── delta.py       # cumulative time delta to pole, anchored to official lap times
│   │   ├── dynamics.py    # smoothed curvature, lateral and longitudinal g
│   │   ├── features.py    # mini-sectors, corner V/U shape, driving-style features
│   │   └── export.py      # compact columnar JSON writer + session index
│   ├── build_session.py   # CLI: build one session JSON end to end
│   ├── requirements.txt
│   └── cache/             # FastF1 download cache (gitignored)
├── web/
│   ├── public/
│   │   ├── sessions/      # precomputed session JSON + index.json manifest
│   │   └── teams/         # team logo SVGs
│   ├── src/
│   │   ├── components/
│   │   │   ├── TrackMap.jsx         # ghost replay, controls, live gap tower
│   │   │   ├── Pairwise.jsx         # two-driver deep dive
│   │   │   ├── VehicleDynamics.jsx  # g-g diagram, grip map, braking table
│   │   │   ├── MiniSectors.jsx      # dominance patchwork + composite ideal lap
│   │   │   └── DrivingStyle.jsx     # style map + ranked habit bars
│   │   ├── lib/
│   │   │   ├── loadSession.js       # fetch a session and the index
│   │   │   └── chartTheme.js        # shared Recharts theme
│   │   ├── App.jsx                  # session picker + view tabs
│   │   └── main.jsx
│   └── package.json
├── vercel.json            # static build config (output web/dist)
└── README.md
```

## Prerequisites

- Python 3.11 or newer (for the pipeline)
- Node.js 20 or newer (for the frontend)
- Git

You only need Python if you intend to build new session files. The frontend runs against the session JSON already committed under `web/public/sessions/`.

## Pipeline setup

From the repo root (`D:\Ghostline`), create the virtual environment once and install the dependencies (`fastf1`, `pandas`, `numpy`, `scipy`, `scikit-learn`):

```powershell
python -m venv pipeline\venv
pipeline\venv\Scripts\Activate.ps1
pip install -r pipeline\requirements.txt
```

Build one session. This loads the session, picks every driver's fastest lap, resamples and computes all channels, and writes the JSON into `web/public/sessions/` alongside a refreshed `index.json`:

```powershell
pipeline\venv\Scripts\python.exe pipeline\build_session.py --year 2024 --gp "Bahrain" --session Q
```

Flags: `--year` and `--gp` are required, `--session` defaults to `Q`, and `--out` defaults to `web/public/sessions`. Three optional flags tune mini-sector detection: `--ms-min-curvature`, `--ms-min-spacing`, and `--ms-max-segment`. The first run for a season downloads several hundred MB into `pipeline/cache/` and is slow; later runs hit the cache and are fast. Build against completed sessions; the 2024 season is the stable reference.

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

For continuous deploys, connect the GitHub repository in the Vercel dashboard (Project, then Settings, then Git). After that, every `git push` to the default branch rebuilds and updates the live site automatically, usually within a minute or two.

## Adding more sessions

To add a race, run the build command with a different `--year` and `--gp`, then commit the new file:

```powershell
pipeline\venv\Scripts\python.exe pipeline\build_session.py --year 2024 --gp "Monaco" --session Q
```

`build_session.py` regenerates `web/public/sessions/index.json` on every run, so the new race shows up in the picker automatically once the file is built and deployed.

## FastF1 accuracy caveats

The public telemetry feed has real limits. The pipeline works around them instead of papering over them:

- Position data arrives at only about 4 to 5 Hz and is jittery; anything smoother is interpolation. X/Y are smoothed with a Savitzky-Golay filter before differentiating, and dynamics are computed on raw single-lap data before resampling onto the 5 m grid.
- **Lateral g** (`speed² · curvature / 9.81`) comes out realistic, around 4 to 6 g in fast corners, and is trustworthy. **Longitudinal g** (`d(speed)/dt / 9.81`) is approximate. FastF1's own maintainer notes it is hard to compute reliably from this feed, so the app labels it that way.
- Overlaying two different laps carries roughly ±10 m of position uncertainty, so the track map is for visualization. Timing math anchors to the reliable speed and time channels instead.
- 2018 and later seasons only. The 2026 public feed has no DRS, active-aero, or energy-deployment data.

## Credits

Built on [FastF1](https://github.com/theOehrly/Fast-F1), which provides the official timing and telemetry. This is an unofficial project. It is not associated with, endorsed by, or affiliated with Formula 1, the FIA, or any team.
