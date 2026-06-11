"""Load a qualifying session and pick each driver's fastest lap."""

from pathlib import Path

import fastf1
import pandas as pd

CACHE_DIR = Path(__file__).resolve().parent.parent / "cache"


def load_quali_session(year, gp, session="Q"):
    """Return a fully loaded FastF1 session, caching downloads in pipeline/cache."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(str(CACHE_DIR))
    s = fastf1.get_session(year, gp, session)
    s.load()
    return s


def get_fastest_laps(session):
    """Map driver code -> fastest valid Lap, sorted by lap time (pole first)."""
    fastest = {}
    for number in session.drivers:
        lap = session.laps.pick_drivers(number).pick_fastest()
        if lap is None or pd.isna(lap["LapTime"]):
            continue
        fastest[lap["Driver"]] = lap
    return dict(sorted(fastest.items(), key=lambda item: item[1]["LapTime"]))
