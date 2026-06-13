"""Mini-sector dominance: slice the lap into micro-segments and find, per
segment, which driver of the full field is fastest.

Segment timing is read straight from the delta channel (each driver's
cumulative time gap to pole on the 5m grid), which sidesteps the per-driver
grid-length differences: the gap between two grid indices is a real elapsed
time difference relative to pole.
"""

import numpy as np
from scipy.signal import find_peaks

STEP_M = 5.0


def _detect_apexes(curvature, min_curvature, min_spacing_m):
    """Distances (m) of corner apexes: peaks of |curvature| on the pole lap."""
    distance = min_spacing_m / STEP_M
    peaks, _ = find_peaks(np.abs(curvature),
                          height=min_curvature,
                          distance=max(1, int(round(distance))))
    return peaks * STEP_M


def _segment_boundaries(apex_distances, track_length, max_segment_m):
    """Boundaries snapped to the 5m grid: 0, the midpoints between consecutive
    apexes, and track_length, with any span longer than max_segment_m split
    into equal pieces.
    """
    mids = (apex_distances[:-1] + apex_distances[1:]) / 2.0
    raw = [0.0, *mids.tolist(), float(track_length)]

    refined = [raw[0]]
    for b0, b1 in zip(raw[:-1], raw[1:]):
        span = b1 - b0
        n = max(1, int(np.ceil(span / max_segment_m)))
        for k in range(1, n + 1):
            refined.append(b0 + span * k / n)

    # Snap to the 5m grid and drop duplicates while staying ascending.
    snapped = []
    for b in refined:
        s = round(b / STEP_M) * STEP_M
        if not snapped or s > snapped[-1]:
            snapped.append(s)
    snapped[0] = 0.0
    snapped[-1] = round(float(track_length) / STEP_M) * STEP_M
    return snapped


def compute_minisectors(drivers, pole_code, track_length, curvature,
                        min_curvature, min_spacing_m, max_segment_m):
    """Mini-sector dominance over the full field.

    drivers: {code: {"channels": {"delta": np.ndarray, ...}, ...}} in official
             classification order (pole first).
    curvature: the pole lap's signed curvature array (1/m), aligned to the grid.

    Returns (result, n_apexes) where result is:
      {"boundaries": [..0.1f..], "winners": [code per segment],
       "composite_ideal": float}
    len(boundaries) == len(winners) + 1.
    """
    pole_time = drivers[pole_code]["lap_time"]
    apexes = _detect_apexes(curvature, min_curvature, min_spacing_m)
    boundaries = _segment_boundaries(apexes, track_length, max_segment_m)

    codes = list(drivers)  # classification order, pole first

    def rel(code, i0, i1):
        delta = drivers[code]["channels"]["delta"]
        n = len(delta)
        return float(delta[min(i1, n - 1)] - delta[min(i0, n - 1)])

    winners = []
    composite_ideal = pole_time
    for b0, b1 in zip(boundaries[:-1], boundaries[1:]):
        i0 = int(round(b0 / STEP_M))
        i1 = int(round(b1 / STEP_M))
        rels = [rel(code, i0, i1) for code in codes]
        best = int(np.argmin(rels))  # ties -> first in classification order
        winners.append(codes[best])
        composite_ideal += rels[best]

    result = {
        "boundaries": [round(float(b), 1) for b in boundaries],
        "winners": winners,
        "composite_ideal": round(float(composite_ideal), 3),
    }
    return result, len(apexes)
