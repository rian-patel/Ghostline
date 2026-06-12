"""Write one compact session JSON for the frontend."""

import json
from pathlib import Path


def _round_channels(channels):
    return {
        "distance": [round(float(v), 1) for v in channels["distance"]],
        "x": [round(float(v), 1) for v in channels["x"]],
        "y": [round(float(v), 1) for v in channels["y"]],
        "speed": [int(round(float(v))) for v in channels["speed"]],
        "throttle": [int(round(float(v))) for v in channels["throttle"]],
        "brake": [int(v > 0.5) for v in channels["brake"]],
        "gear": [int(round(float(v))) for v in channels["gear"]],
        "time": [round(float(v), 3) for v in channels["time"]],
        "delta": [round(float(v), 3) for v in channels["delta"]],
        "curvature": [round(float(v), 4) for v in channels["curvature"]],
        "lat_g": [round(float(v), 2) for v in channels["lat_g"]],
        "long_g": [round(float(v), 2) for v in channels["long_g"]],
    }


def export_session(meta, drivers, out_path):
    """Write {meta, drivers} to out_path as compact JSON. Returns the Path."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "meta": meta,
        "drivers": {
            code: {"lap_time": d["lap_time"],
                   "team": d["team"],
                   "channels": _round_channels(d["channels"])}
            for code, d in drivers.items()
        },
    }
    with open(out_path, "w") as f:
        json.dump(payload, f, separators=(",", ":"))
    return out_path
