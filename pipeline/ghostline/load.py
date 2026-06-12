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


def _final_segment_index(row):
    """Index into [q1, q2, q3] of the last segment this driver took part in."""
    if not pd.isna(row["Q3"]):
        return 2
    if not pd.isna(row["Q2"]):
        return 1
    return 0


def _norm_color(value):
    """FastF1 TeamColor is hex without '#'. Return '#rrggbb' or '' if missing."""
    if value is None or pd.isna(value) or str(value).strip() == "":
        return ""
    return "#" + str(value).strip().lstrip("#").lower()


def get_fastest_laps(session):
    """Return (laps, teams), both ordered by official quali classification.

    laps maps driver code -> the fastest valid Lap from that driver's final
    segment (Q3 if reached, else Q2, else Q1), falling back to an earlier
    segment if the final one has no usable lap. Drivers with no usable lap in
    any segment are skipped. teams maps the same codes -> {"name", "color"}.
    """
    segments = session.laps.split_qualifying_sessions()
    laps = {}
    teams = {}
    for _, row in session.results.iterrows():
        code = row["Abbreviation"]
        start = _final_segment_index(row)
        for idx in range(start, -1, -1):
            segment = segments[idx]
            if segment is None:
                continue
            lap = segment.pick_drivers(code).pick_fastest()
            if lap is None or pd.isna(lap["LapTime"]):
                continue
            laps[code] = lap
            break
        if code not in laps:
            continue
        teams[code] = {"name": str(row["TeamName"]),
                       "color": _norm_color(row["TeamColor"])}
    return laps, teams
