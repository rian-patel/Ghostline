# Ghostline

Ghostline is a browser-based F1 qualifying analysis app. A Python pipeline built on FastF1 precomputes each qualifying session — every driver's fastest lap resampled onto a common distance grid, with time deltas and derived vehicle dynamics — into one compact JSON file. A Vite + React frontend loads those static files and replays the entire field's fastest laps as synchronized ghost cars on a canvas track map, alongside pairwise telemetry comparisons and physics-based analysis views. Unofficial project using the FastF1 library; not associated with Formula 1.
