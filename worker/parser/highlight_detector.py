"""
CS2 demo highlight detector using demoparser2.

Detects:
  - Multikills  : 2K, 3K, 4K, ACE  (kills grouped by attacker + round)
  - Clutches    : 1v1 → 1v5        (last-alive player winning a round)
  - Knife kills : any knife weapon
"""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd
from demoparser2 import DemoParser

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

# Valve team numbers in CS2 demos
TEAM_T  = 2
TEAM_CT = 3

# Weapon prefixes / names that count as knife
KNIFE_PREFIX = "knife"

# Multikill thresholds
MULTIKILL_TYPES: dict[str, int] = {
    "multikill_2k":  2,
    "multikill_3k":  3,
    "multikill_4k":  4,
    "multikill_ace": 5,
}

# Ticks to include before the first kill / after the last kill in a clip window
CLIP_PAD_BEFORE = 192   # ~3 s at 64 tick
CLIP_PAD_AFTER  = 320   # ~5 s at 64 tick


# ── Public API ────────────────────────────────────────────────────────────────

def detect_highlights(
    dem_file: str,
    action_types: list[str],
) -> tuple[list[dict[str, Any]], str | None, str | None]:
    """
    Parse a CS2 .dem file and return (highlights, map_name, match_date).

    highlights is a list of dicts ready to be inserted into the `highlights`
    Supabase table:
        type, tick_start, tick_end, round, kills

    action_types is the list stored on the demo row.  An empty list means
    "detect everything".
    """
    parser = DemoParser(dem_file)

    # ── Header (map name, etc.) ───────────────────────────────────────────────
    map_name: str | None = None
    match_date: str | None = None
    try:
        header = parser.parse_header()
        map_name = header.get("map_name")
    except Exception as exc:
        logger.warning("Could not read demo header: %s", exc)

    # ── Kill events ───────────────────────────────────────────────────────────
    try:
        kills: pd.DataFrame = parser.parse_event(
            "player_death",
            player=["team_num"],
            other=["total_rounds_played"],
        )
    except Exception as exc:
        raise ValueError(f"Failed to parse player_death events: {exc}") from exc

    if kills is None or len(kills) == 0:
        logger.info("No kill events found in demo.")
        return [], map_name, match_date

    # Normalise column names (demoparser2 may vary slightly between versions)
    kills = _normalise_kills(kills)

    if kills is None or len(kills) == 0:
        return [], map_name, match_date

    # ── Round-end events (for clutch win confirmation) ────────────────────────
    round_winners: dict[int, int] = {}   # round_num → winning team number
    try:
        round_ends: pd.DataFrame = parser.parse_event(
            "round_end",
            other=["total_rounds_played"],
        )
        if round_ends is not None and len(round_ends) > 0:
            for _, row in round_ends.iterrows():
                r_num = _safe_int(row.get("total_rounds_played"))
                winner = _safe_int(row.get("winner"))
                if r_num is not None and winner is not None:
                    round_winners[r_num] = winner
    except Exception as exc:
        logger.warning("Could not parse round_end events: %s", exc)

    # ── Decide which types to look for ───────────────────────────────────────
    want: set[str] = set(action_types) if action_types else set(MULTIKILL_TYPES) | {
        f"clutch_1v{n}" for n in range(1, 6)
    } | {"knife"}

    highlights: list[dict[str, Any]] = []

    # Multikills
    want_mk = {t for t in want if t in MULTIKILL_TYPES}
    if want_mk:
        highlights.extend(_detect_multikills(kills, want_mk))

    # Knife kills
    if "knife" in want:
        highlights.extend(_detect_knife_kills(kills))

    # Clutches
    want_clutch = {t for t in want if t.startswith("clutch_")}
    if want_clutch:
        highlights.extend(_detect_clutches(kills, round_winners, want_clutch))

    logger.info(
        "Detected %d highlights (%d multikills, %d knife, %d clutches)",
        len(highlights),
        sum(1 for h in highlights if h["type"].startswith("multikill")),
        sum(1 for h in highlights if h["type"] == "knife"),
        sum(1 for h in highlights if h["type"].startswith("clutch")),
    )
    return highlights, map_name, match_date


# ── Internal helpers ──────────────────────────────────────────────────────────

def _normalise_kills(df: pd.DataFrame) -> pd.DataFrame | None:
    """Rename columns to a consistent schema and drop invalid rows."""
    # Some demoparser2 versions use slightly different column names
    renames = {
        "attackerxuid":   "attacker_steamid",
        "userxuid":       "user_steamid",
        "attacker_xuid":  "attacker_steamid",
        "user_xuid":      "user_steamid",
        "attacker_team":  "attacker_team_num",
        "user_team":      "user_team_num",
    }
    df = df.rename(columns={k: v for k, v in renames.items() if k in df.columns})

    required = {"tick", "attacker_steamid", "user_steamid"}
    missing = required - set(df.columns)
    if missing:
        logger.warning("Kill events missing columns: %s", missing)
        return None

    # Drop suicides and world-damage deaths (attacker == victim or attacker == 0)
    df = df[df["attacker_steamid"] != df["user_steamid"]]
    df = df[df["attacker_steamid"].notna() & (df["attacker_steamid"] != 0)]

    # Drop team kills if we have team info
    if "attacker_team_num" in df.columns and "user_team_num" in df.columns:
        df = df[df["attacker_team_num"] != df["user_team_num"]]

    return df.reset_index(drop=True)


def _round_col(df: pd.DataFrame) -> str:
    """Return whichever round column is present."""
    for col in ("total_rounds_played", "round", "round_num"):
        if col in df.columns:
            return col
    raise KeyError("No round column found in kills DataFrame")


def _detect_multikills(
    kills: pd.DataFrame,
    want: set[str],
) -> list[dict[str, Any]]:
    highlights: list[dict[str, Any]] = []
    min_kills = min(MULTIKILL_TYPES[t] for t in want)

    try:
        rcol = _round_col(kills)
    except KeyError:
        logger.warning("Cannot detect multikills: no round column.")
        return highlights

    for (round_num, attacker_id), group in kills.groupby([rcol, "attacker_steamid"]):
        if pd.isna(attacker_id) or attacker_id == 0:
            continue
        n = len(group)
        if n < min_kills:
            continue

        # Pick the best matching type
        h_type: str | None = None
        for type_name, threshold in sorted(MULTIKILL_TYPES.items(), key=lambda x: -x[1]):
            if n >= threshold and type_name in want:
                h_type = type_name
                break
        if h_type is None:
            continue

        ticks = sorted(group["tick"].astype(int).tolist())
        highlights.append({
            "type":       h_type,
            "tick_start": max(0, ticks[0] - CLIP_PAD_BEFORE),
            "tick_end":   ticks[-1] + CLIP_PAD_AFTER,
            "round":      int(round_num),
            "kills":      n,
        })

    return highlights


def _detect_knife_kills(kills: pd.DataFrame) -> list[dict[str, Any]]:
    if "weapon" not in kills.columns:
        logger.debug("No 'weapon' column — skipping knife detection.")
        return []

    try:
        rcol = _round_col(kills)
    except KeyError:
        rcol = None

    knife_kills = kills[
        kills["weapon"].astype(str).str.startswith(KNIFE_PREFIX)
    ]

    highlights: list[dict[str, Any]] = []
    for _, row in knife_kills.iterrows():
        tick = int(row["tick"])
        highlights.append({
            "type":       "knife",
            "tick_start": max(0, tick - CLIP_PAD_BEFORE),
            "tick_end":   tick + CLIP_PAD_AFTER,
            "round":      int(row[rcol]) if rcol else 0,
            "kills":      1,
        })
    return highlights


def _detect_clutches(
    kills: pd.DataFrame,
    round_winners: dict[int, int],
    want: set[str],
) -> list[dict[str, Any]]:
    """
    Detect 1vN clutch situations.

    For each round we replay the death sequence. When one side reaches
    exactly 1 alive player and the opponent side has N>1, we record a
    potential clutch. We then confirm it using round_winners (if available).
    """
    if "user_team_num" not in kills.columns or "attacker_team_num" not in kills.columns:
        logger.debug("No team columns — skipping clutch detection.")
        return []

    try:
        rcol = _round_col(kills)
    except KeyError:
        return []

    highlights: list[dict[str, Any]] = []

    for round_num, round_kills in kills.groupby(rcol):
        round_kills = round_kills.sort_values("tick")
        r_int = int(round_num)

        ct_alive = 5
        t_alive  = 5
        clutch_recorded = False

        for _, death in round_kills.iterrows():
            victim_team = _safe_int(death.get("user_team_num"))
            if victim_team == TEAM_CT:
                ct_alive = max(0, ct_alive - 1)
            elif victim_team == TEAM_T:
                t_alive  = max(0, t_alive - 1)

            if clutch_recorded:
                continue

            # Check for a 1vN situation
            clutch_team: int | None = None
            n_opponents: int | None = None

            if ct_alive == 1 and t_alive > 1:
                clutch_team = TEAM_CT
                n_opponents = t_alive
            elif t_alive == 1 and ct_alive > 1:
                clutch_team = TEAM_T
                n_opponents = ct_alive

            if clutch_team is None or n_opponents is None:
                continue

            clutch_type = f"clutch_1v{n_opponents}"
            if clutch_type not in want:
                continue

            # Confirm the clutch team actually won the round (if we have the info)
            if round_winners:
                winner = round_winners.get(r_int)
                if winner is not None and winner != clutch_team:
                    continue  # Lost — not a clutch

            # Tick of the moment the clutch situation started
            clutch_tick = int(death["tick"])
            last_tick   = int(round_kills["tick"].max())

            highlights.append({
                "type":       clutch_type,
                "tick_start": max(0, clutch_tick - CLIP_PAD_BEFORE),
                "tick_end":   last_tick + CLIP_PAD_AFTER,
                "round":      r_int,
                "kills":      1,
            })
            clutch_recorded = True

    return highlights


def _safe_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
