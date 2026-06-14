"""Resample one lap's telemetry onto a common distance grid."""

import numpy as np
from scipy.interpolate import interp1d


def resample_lap(lap, step_m=5.0):
    """Return {channel: np.ndarray} for one lap, sampled every step_m meters.

    Channels: distance, x, y, speed, throttle, brake, gear, time.
    X/Y are converted from FastF1's 1/10 m units to meters.
    """
    car = lap.get_car_data().add_distance()
    pos = lap.get_pos_data()

    car_time = car["Time"].dt.total_seconds().to_numpy()
    car_dist = car["Distance"].to_numpy()

    # Some laps in the public feed carry corrupt telemetry whose distance never
    # accumulates (e.g. RUS at Miami 2025). Reject them so the caller skips the
    # driver instead of emitting an empty grid that breaks downstream math.
    if car_dist.size < 2 or not np.isfinite(car_dist[-1]) or car_dist[-1] <= step_m:
        span = float(car_dist[-1]) if car_dist.size else 0.0
        raise ValueError(f"degenerate lap: distance span {span:.1f} m")

    grid = np.arange(0.0, car_dist[-1], step_m)

    # Position samples arrive on their own clock; map each one to a lap
    # distance via the car-data time->distance relation, then interpolate
    # x/y along distance like every other channel.
    pos_time = pos["Time"].dt.total_seconds().to_numpy()
    pos_dist = np.interp(pos_time, car_time, car_dist)

    def linear(x, y):
        return np.interp(grid, x, y)

    def nearest(x, y):
        f = interp1d(x, y, kind="nearest", bounds_error=False,
                     fill_value=(y[0], y[-1]))
        return f(grid)

    return {
        "distance": grid,
        "x": linear(pos_dist, pos["X"].to_numpy() / 10.0),
        "y": linear(pos_dist, pos["Y"].to_numpy() / 10.0),
        "speed": linear(car_dist, car["Speed"].to_numpy()),
        "throttle": linear(car_dist, car["Throttle"].to_numpy()),
        "brake": nearest(car_dist, car["Brake"].to_numpy().astype(float)),
        "gear": nearest(car_dist, car["nGear"].to_numpy().astype(float)),
        "time": linear(car_dist, car_time),
    }
