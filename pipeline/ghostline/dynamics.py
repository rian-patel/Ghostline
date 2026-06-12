"""Curvature and g-forces from one raw lap, resampled onto the grid.

Accuracy rule (see CLAUDE.md): compute curvature and g-forces on the RAW
single-lap data first, smoothing X/Y in meters with savgol_filter BEFORE
differentiating, and resample onto the common 5m grid only at the very end.
"""

import numpy as np
from scipy.signal import savgol_filter

G = 9.81
KMH_TO_MS = 1.0 / 3.6


def _odd_window(window, polyorder, length):
    """Largest usable odd window_length <= window that fits the series.

    Shrinks to the largest odd number <= length-1 when the series is shorter
    than the requested window. Returns None if no valid window exists.
    """
    w = min(window, length if length % 2 else length - 1)
    if w % 2 == 0:
        w -= 1
    if w <= polyorder or w < 3:
        return None
    return w


def _smooth(values, window, polyorder):
    """savgol_filter with the shrink guard; pass through if too short."""
    w = _odd_window(window, polyorder, len(values))
    if w is None:
        return values
    return savgol_filter(values, window_length=w, polyorder=polyorder)


def compute_dynamics(lap, grid, smooth_window=11, smooth_polyorder=3):
    """Return {"curvature", "lat_g", "long_g"} aligned with grid["distance"].

    curvature is signed (1/m), lat_g and long_g are signed g's. long_g is
    approximate (it differentiates speed).

    smooth_window default is 11 (not 21): the 2024 public car+position feed is
    only ~4 Hz, so a 21-sample savgol window spans ~5 s of track and flattens
    real braking spikes below physical plausibility. At ~4 Hz, 11 keeps peak
    lateral g in the realistic 4-6 g band and braking near -4 g.
    """
    target = grid["distance"]

    pos = lap.get_pos_data()
    car = lap.get_car_data().add_distance()

    car_time = car["Time"].dt.total_seconds().to_numpy()
    car_dist = car["Distance"].to_numpy()
    car_speed_ms = car["Speed"].to_numpy() * KMH_TO_MS

    # car-data time must be sorted/monotonic and unique for np.interp/gradient.
    order = np.argsort(car_time)
    car_time = car_time[order]
    car_dist = car_dist[order]
    car_speed_ms = car_speed_ms[order]
    keep = np.concatenate(([True], np.diff(car_time) > 0))
    car_time = car_time[keep]
    car_dist = car_dist[keep]
    car_speed_ms = car_speed_ms[keep]

    # --- position samples: assign each a lap distance via time -> distance ---
    pos_time = pos["Time"].dt.total_seconds().to_numpy()
    x_m = pos["X"].to_numpy() / 10.0
    y_m = pos["Y"].to_numpy() / 10.0

    p_order = np.argsort(pos_time)
    pos_time = pos_time[p_order]
    x_m = x_m[p_order]
    y_m = y_m[p_order]
    p_keep = np.concatenate(([True], np.diff(pos_time) > 0))
    pos_time = pos_time[p_keep]
    x_m = x_m[p_keep]
    y_m = y_m[p_keep]

    pos_dist = np.interp(pos_time, car_time, car_dist)

    # Several position samples can map to the same lap distance (car barely
    # moving, or interp clamping at the ends). A zero-spacing distance axis
    # makes np.gradient divide by zero -> inf/nan in curvature. Keep only the
    # strictly-increasing-distance samples so the distance axis is well posed.
    d_keep = np.concatenate(([True], np.diff(pos_dist) > 0))
    pos_dist = pos_dist[d_keep]
    pos_time = pos_time[d_keep]
    x_m = x_m[d_keep]
    y_m = y_m[d_keep]

    # --- smooth X/Y in meters BEFORE differentiating ---
    x_s = _smooth(x_m, smooth_window, smooth_polyorder)
    y_s = _smooth(y_m, smooth_window, smooth_polyorder)

    # --- curvature against distance (not sample index) ---
    dx = np.gradient(x_s, pos_dist)
    dy = np.gradient(y_s, pos_dist)
    ddx = np.gradient(dx, pos_dist)
    ddy = np.gradient(dy, pos_dist)

    denom = (dx * dx + dy * dy) ** 1.5
    kappa = np.zeros_like(denom)
    valid = denom > 1e-9
    kappa[valid] = (dx[valid] * ddy[valid] - dy[valid] * ddx[valid]) / denom[valid]

    # Second-differentiating ~4 Hz position against a non-uniform distance axis
    # leaves residual ripple that, multiplied by speed^2, spikes lat_g at high
    # speed. Smooth kappa once more on the raw single-lap series (same window/
    # polyorder), still before the final resample. Keeps it signed.
    kappa = _smooth(kappa, smooth_window, smooth_polyorder)

    # --- lateral g: speed at the pos timestamps ---
    speed_at_pos = np.interp(pos_time, car_time, car_speed_ms)
    lat_g = (speed_at_pos ** 2 * kappa) / G

    # --- longitudinal g on the (higher-rate) car series, smoothed after ---
    long_g_car = np.gradient(car_speed_ms, car_time) / G
    long_g_car = _smooth(long_g_car, smooth_window, smooth_polyorder)

    # --- resample LAST ---
    return {
        "curvature": np.interp(target, pos_dist, kappa),
        "lat_g": np.interp(target, pos_dist, lat_g),
        "long_g": np.interp(target, car_dist, long_g_car),
    }
