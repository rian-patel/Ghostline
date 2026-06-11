"""Cumulative time delta to the reference (pole) lap along the lap distance."""

import numpy as np

KMH_TO_MS = 1.0 / 3.6


def _cumulative_time(grid, lap_time):
    """Cumulative time (s) at each grid point, integrating 1/speed over
    distance, rescaled so the lap total equals the official lap time.

    The rescale corrects the small drift left by integrating measured speed
    (each lap's distance channel carries its own scale error); official lap
    times from the timing loops are exact.
    """
    step = grid["distance"][1] - grid["distance"][0]
    inv_v = 1.0 / np.maximum(grid["speed"] * KMH_TO_MS, 1.0)
    cum = np.concatenate(([0.0],
                          np.cumsum(0.5 * (inv_v[1:] + inv_v[:-1])) * step))
    return cum * (lap_time / cum[-1])


def cumulative_delta(target_grid, pole_grid, target_lap_time, pole_lap_time):
    """Time delta (s) of a target lap vs the pole lap at every target grid
    point. Positive = slower than pole.

    Laps are aligned by fraction of lap completed (lap lengths differ by a
    few meters between cars), so the delta at the finish line equals the
    official lap-time gap exactly. Returned array matches the target grid.
    """
    t_target = _cumulative_time(target_grid, target_lap_time)
    t_pole = _cumulative_time(pole_grid, pole_lap_time)
    d_t = target_grid["distance"]
    d_p = pole_grid["distance"]
    frac = d_t / d_t[-1]
    pole_at_frac = np.interp(frac * d_p[-1], d_p, t_pole)
    return t_target - pole_at_frac
