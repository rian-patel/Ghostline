"""Build one session JSON from FastF1 data.

Usage: python pipeline/build_session.py --year 2024 --gp "Bahrain" --session Q
"""

import argparse
from pathlib import Path

from ghostline.delta import cumulative_delta
from ghostline.dynamics import compute_dynamics
from ghostline.export import export_session, write_index
from ghostline.features import (
    classify_corner_shapes,
    compute_minisectors,
    compute_sectors,
    compute_style,
)
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
    parser.add_argument("--ms-min-curvature", type=float, default=0.004,
                        help="min |curvature| (1/m) for a mini-sector apex peak")
    parser.add_argument("--ms-min-spacing", type=float, default=100.0,
                        help="min distance (m) between mini-sector apexes")
    parser.add_argument("--ms-max-segment", type=float, default=200.0,
                        help="max mini-sector length (m); longer spans split")
    args = parser.parse_args()

    session = load_quali_session(args.year, args.gp, args.session)
    laps, teams = get_fastest_laps(session)

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
        channels.update(compute_dynamics(laps[code], grid))
        drivers[code] = {
            "lap_time": round(lap_time, 3),
            "team": teams[code],
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
    # FastF1 occasionally lists corners out of distance order (e.g. Baku 2025);
    # sort by lap distance so corner windows stay monotonic downstream.
    corners.sort(key=lambda c: c["distance"])

    track_length = round(float(pole_grid["distance"][-1]), 1)
    minisectors, n_apexes = compute_minisectors(
        drivers, pole_code, track_length,
        drivers[pole_code]["channels"]["curvature"],
        min_curvature=args.ms_min_curvature,
        min_spacing_m=args.ms_min_spacing,
        max_segment_m=args.ms_max_segment,
    )
    print(f"mini-sectors: {n_apexes} apexes, "
          f"{len(minisectors['winners'])} segments")

    corner_distances = [c["distance"] for c in corners]
    style = None
    if len(corner_distances) >= 2:
        shapes = classify_corner_shapes(
            drivers[pole_code]["channels"], corner_distances)
        for corner, shape in zip(corners, shapes):
            corner["shape"] = shape
        style = compute_style(drivers, corner_distances)
        if style is not None:
            print(f"style: {len(style['drivers'])} drivers, "
                  f"{len(style['feature_names'])} corner-style features")

    meta = {
        "year": args.year,
        "gp": args.gp,
        "round": int(session.event["RoundNumber"]),
        "session": args.session,
        "track_length": track_length,
        "pole_driver": pole_code,
        "pole_time": drivers[pole_code]["lap_time"],
        "corners": corners,
        "sectors": compute_sectors(laps[pole_code], pole_grid),
        "minisectors": minisectors,
        "style": style,
        "caveats": [
            "Longitudinal g is approximate: derived by differentiating speed.",
            "Position data is ~4-5 Hz interpolated; curvature and lateral g "
            "are computed from smoothed position data.",
        ],
    }

    slug = args.gp.lower().replace(" ", "_")
    out_file = Path(args.out) / f"{args.year}_{slug}_{args.session}.json"
    path = export_session(meta, drivers, out_file)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB)")

    index_path = write_index(args.out)
    print(f"index: {index_path}")


if __name__ == "__main__":
    main()
