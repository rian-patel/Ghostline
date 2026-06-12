"""Build one session JSON from FastF1 data.

Usage: python pipeline/build_session.py --year 2024 --gp "Bahrain" --session Q
"""

import argparse
from pathlib import Path

from ghostline.delta import cumulative_delta
from ghostline.export import export_session
from ghostline.load import get_fastest_laps, load_quali_session
from ghostline.resample import resample_lap

REPO_ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--gp", required=True)
    parser.add_argument("--session", default="Q")
    parser.add_argument("--out",
                        default=str(REPO_ROOT / "web" / "public" / "sessions"))
    args = parser.parse_args()

    session = load_quali_session(args.year, args.gp, args.session)
    laps = get_fastest_laps(session)

    grids = {}
    for code, lap in laps.items():
        try:
            grids[code] = resample_lap(lap)
        except Exception as exc:
            print(f"skipping {code}: no usable telemetry ({exc})")

    codes = [c for c in laps if c in grids]
    pole_code = codes[0]
    pole_grid = grids[pole_code]
    pole_time = laps[pole_code]["LapTime"].total_seconds()

    drivers = {}
    for code in codes:
        grid = grids[code]
        lap_time = laps[code]["LapTime"].total_seconds()
        channels = dict(grid)
        channels["delta"] = cumulative_delta(grid, pole_grid,
                                             lap_time, pole_time)
        drivers[code] = {
            "lap_time": round(lap_time, 3),
            "channels": channels,
        }

    circuit_info = session.get_circuit_info()
    corners = [
        {
            "number": int(row["Number"]),
            "letter": str(row["Letter"]) if row["Letter"] else "",
            "distance": round(float(row["Distance"]), 1),
        }
        for _, row in circuit_info.corners.iterrows()
    ] if circuit_info is not None else []

    meta = {
        "year": args.year,
        "gp": args.gp,
        "session": args.session,
        "track_length": round(float(pole_grid["distance"][-1]), 1),
        "pole_driver": pole_code,
        "pole_time": drivers[pole_code]["lap_time"],
        "corners": corners,
    }

    slug = args.gp.lower().replace(" ", "_")
    out_file = Path(args.out) / f"{args.year}_{slug}_{args.session}.json"
    path = export_session(meta, drivers, out_file)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
