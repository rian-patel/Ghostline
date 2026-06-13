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


def compute_sectors(pole_lap, pole_grid):
    """Sector boundary distances (m) for the pole lap.

    Derived from the lap's official Sector1/Sector2 durations mapped through
    the grid's cumulative time->distance relation. Returns [s1_end, s2_end]
    (two boundaries => three sectors), or [] if sector times are unavailable.
    """
    try:
        s1 = float(pole_lap["Sector1Time"].total_seconds())
        s2 = float(pole_lap["Sector2Time"].total_seconds())
    except (KeyError, AttributeError, TypeError):
        return []
    if not (np.isfinite(s1) and np.isfinite(s2)):
        return []
    time = pole_grid["time"]
    dist = pole_grid["distance"]
    d1 = float(np.interp(s1, time, dist))
    d2 = float(np.interp(s1 + s2, time, dist))
    return [round(d1, 1), round(d2, 1)]


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


# --- Driving-style features -----------------------------------------------

# Per-driver corner habits, each a plain, named quantity the frontend turns
# into the style map and per-trait rankings. Order is the radar/bar order.
FEATURE_NAMES = ["apex_speed", "brake_point", "throttle_app",
                 "exit_speed", "trail_brake"]


def _corner_windows(corner_distances, n_grid):
    """Index windows [i0, i1] per corner on the 5m grid. Each corner owns the
    stretch from the midpoint to the previous corner up to the midpoint to the
    next one (matches the pairwise corner table)."""
    bounds = [0.0]
    for a, b in zip(corner_distances[:-1], corner_distances[1:]):
        bounds.append((a + b) / 2.0)
    bounds.append((n_grid - 1) * STEP_M)

    def idx(d):
        return max(0, min(n_grid - 1, int(round(d / STEP_M))))

    return [(idx(bounds[i]), idx(bounds[i + 1]))
            for i in range(len(corner_distances))]


def _corner_features(channels, i0, i1):
    """Five style features for one driver in one corner window, or None if the
    window is degenerate. Distances are relative to the apex so they describe
    driving style, not where the corner sits on track."""
    speed = channels["speed"]
    throttle = channels["throttle"]
    brake = channels["brake"]
    lat_g = channels["lat_g"]
    dist = channels["distance"]

    n = len(speed)
    i0 = min(i0, n - 1)
    i1 = min(i1, n - 1)
    if i1 <= i0:
        return None

    apex = i0 + int(np.argmin(speed[i0:i1 + 1]))
    apex_speed = float(speed[apex])
    apex_dist = float(dist[apex])

    # Braking point: how far before the apex the driver first hits the brake.
    brake_point = 0.0
    for k in range(i0, apex + 1):
        if brake[k]:
            brake_point = apex_dist - float(dist[k])
            break

    # Throttle application: how far after the apex throttle returns to ~full.
    throttle_app = float(dist[i1]) - apex_dist
    for k in range(apex, i1 + 1):
        if throttle[k] >= 80:
            throttle_app = float(dist[k]) - apex_dist
            break

    exit_speed = float(speed[i1])

    # Trail braking: metres on the approach spent braking while already
    # loaded up laterally (|lat_g| > 1.5 g).
    trail_brake = 0.0
    for k in range(i0, apex + 1):
        if brake[k] and abs(lat_g[k]) > 1.5:
            trail_brake += STEP_M

    return [apex_speed, brake_point, throttle_app, exit_speed, trail_brake]


def compute_style(drivers, corner_distances):
    """Per-driver corner-style features, averaged over every corner.

    Returns {"feature_names": [...], "drivers": {CODE: {"features": {name:
    value}}}} or None if there are too few corners/drivers. The frontend ranks
    these raw, named quantities against the field — no clustering, so every
    axis a viewer sees maps to one real, explainable number.
    """
    codes = list(drivers)
    if len(corner_distances) < 2 or len(codes) < 3:
        return None

    out = {}
    for code in codes:
        channels = drivers[code]["channels"]
        windows = _corner_windows(corner_distances, len(channels["speed"]))
        feats = [f for f in (_corner_features(channels, i0, i1)
                             for i0, i1 in windows) if f is not None]
        if not feats:
            return None
        mean = np.mean(np.array(feats), axis=0)
        out[code] = {"features": {name: round(float(mean[j]), 2)
                                  for j, name in enumerate(FEATURE_NAMES)}}
    return {"feature_names": FEATURE_NAMES, "drivers": out}


def classify_corner_shapes(pole_channels, corner_distances, u_flatness=0.58):
    """Tag each corner "V" (pointed, quick apex) or "U" (sustained low-speed
    minimum) from the pole lap's speed-profile shape.

    For each corner window we isolate the dip region around the apex (speed
    within the lower half of the corner's speed drop) and measure how flat its
    floor is: flatness = 1 - mean(speed - v_min) / (0.5 * depth). A triangular
    V apex scores ~0.5; a sustained U floor approaches 1. The ratio is
    scale-free, so a slow hairpin and a fast sweeper are judged the same way.
    Returns a list aligned to corner_distances.
    """
    speed = pole_channels["speed"]
    n = len(speed)
    shapes = []
    for i0, i1 in _corner_windows(corner_distances, n):
        i1 = min(i1, n - 1)
        seg = speed[i0:i1 + 1]
        apex = i0 + int(np.argmin(seg))
        v_min = float(speed[apex])
        depth = float(np.max(seg)) - v_min
        if depth <= 0:
            shapes.append("V")
            continue
        half = v_min + 0.5 * depth
        lo = apex
        while lo > i0 and speed[lo - 1] <= half:
            lo -= 1
        hi = apex
        while hi < i1 and speed[hi + 1] <= half:
            hi += 1
        floor = np.asarray(speed[lo:hi + 1], dtype=float)
        flatness = 1.0 - (floor.mean() - v_min) / (0.5 * depth)
        shapes.append("U" if flatness >= u_flatness else "V")
    return shapes
