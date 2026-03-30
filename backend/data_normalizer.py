"""
Normalization Layer — post-parse data cleaning.
Deduplicates, sorts, and truncates scraped player rows.
"""

from typing import Any

METRIC_KEYS = {
    "acs": "acs",
    "kd": "kd",
    "kills": "kills",  # VLR doesn't expose raw kills in stats table; use kpr as proxy
    "hs_pct": "hs_pct",
    "kast": "kast",
}


def normalize_rows(
    rows: list[dict[str, Any]],
    metric: str = "acs",
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Clean, deduplicate, sort, and truncate parsed VLR rows."""

    sort_key = METRIC_KEYS.get(metric, "acs")

    # Deduplicate: keep the row with highest rounds per player
    seen: dict[str, dict[str, Any]] = {}
    for row in rows:
        player = row.get("player")
        if not player:
            continue
        player_lower = player.lower()
        existing = seen.get(player_lower)
        if existing is None or (row.get("rounds") or 0) > (existing.get("rounds") or 0):
            seen[player_lower] = row

    unique = list(seen.values())

    # Sort descending by requested metric
    unique.sort(key=lambda r: r.get(sort_key) or 0, reverse=True)

    # Truncate
    return unique[:limit]
