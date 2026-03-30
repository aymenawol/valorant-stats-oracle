"""
Response Generator — formats parsed data into user-facing text + structured list.
"""

from typing import Any

METRIC_DISPLAY: dict[str, str] = {
    "acs": "ACS",
    "kd": "K/D",
    "kills": "Kills",
    "hs_pct": "HS%",
    "kast": "KAST",
}

REGION_DISPLAY: dict[str, str] = {
    "na": "NA",
    "eu": "EMEA",
    "la": "LATAM",
    "ap": "APAC",
    "mn": "MENA",
}

TIMESPAN_DISPLAY: dict[str, str] = {
    "30": "Last 30 Days",
    "60": "Last 60 Days",
    "90": "Last 90 Days",
}


def _format_metric_value(row: dict[str, Any], metric: str) -> str:
    val = row.get(metric)
    if val is None:
        return "N/A"
    if metric == "kd":
        return f"{val:.2f}"
    if metric == "hs_pct" or metric == "kast":
        return f"{val:.1f}%"
    return str(int(val)) if isinstance(val, float) and val == int(val) else str(val)


def generate_response(
    rows: list[dict[str, Any]],
    query: dict[str, Any],
) -> dict[str, Any]:
    """Generate the final response with headline, ranked list, and metadata."""

    metric = query.get("metric", "acs")
    filters = query.get("filters", {})
    metric_label = METRIC_DISPLAY.get(metric, metric.upper())
    limit = query.get("limit", 5)
    count = len(rows)

    # Build filter segments for display
    segments: list[str] = []
    if filters.get("agent"):
        agent = filters["agent"]
        segments.append(agent if isinstance(agent, str) and agent[0].isupper() else agent.title())
    if filters.get("role"):
        segments.append(filters["role"].title())
    if filters.get("map"):
        map_val = filters["map"]
        segments.append(map_val if isinstance(map_val, str) and map_val[0].isupper() else map_val.title())
    if filters.get("region"):
        segments.append(REGION_DISPLAY.get(str(filters["region"]).lower(), str(filters["region"]).upper()))
    if filters.get("timespan"):
        segments.append(TIMESPAN_DISPLAY.get(str(filters["timespan"]), f"Last {filters['timespan']}d"))

    filter_label = " | ".join(segments) if segments else "All Regions"

    # Build metadata footer
    meta_parts: list[str] = []
    if filters.get("agent"):
        meta_parts.append(f"Agent: {filters['agent'] if isinstance(filters['agent'], str) and filters['agent'][0].isupper() else filters['agent'].title()}")
    if filters.get("role"):
        meta_parts.append(f"Role: {filters['role'].title()}")
    if filters.get("map"):
        map_v = filters["map"]
        meta_parts.append(f"Map: {map_v if isinstance(map_v, str) and map_v[0].isupper() else map_v.title()}")
    if filters.get("region"):
        meta_parts.append(f"Region: {REGION_DISPLAY.get(str(filters['region']).lower(), str(filters['region']).upper())}")
    if filters.get("timespan"):
        meta_parts.append(f"Timespan: {filters['timespan']}d")
    if filters.get("min_rounds"):
        meta_parts.append(f"Min Rounds: {filters['min_rounds']}")

    metadata = " | ".join(meta_parts) if meta_parts else ""

    # No results
    if count == 0:
        return {
            "success": True,
            "headline": "No players matched these filters. Try broadening your search — remove the map filter or extend the timespan.",
            "ranked_label": None,
            "players": [],
            "metadata": metadata,
            "result_count": 0,
        }

    # Build headline
    top = rows[0]
    top_name = top.get("player", "Unknown")
    top_team = top.get("team", "")
    top_val = _format_metric_value(top, metric)
    timespan_text = TIMESPAN_DISPLAY.get(str(filters.get("timespan", "60")), "recently")

    headline = f"{top_name} leads with {top_val} {metric_label}"
    if filter_label:
        headline += f" ({filter_label})"
    headline += "."

    # Adjust label dynamically
    display_count = min(count, limit)
    ranked_label = f"Top {display_count} — {filter_label}" if filter_label else f"Top {display_count}"

    # Build player list
    players: list[dict[str, Any]] = []
    for i, row in enumerate(rows):
        players.append({
            "rank": i + 1,
            "player": row.get("player", "Unknown"),
            "team": row.get("team", ""),
            "value": _format_metric_value(row, metric),
            "metric": metric_label,
            "acs": row.get("acs"),
            "kd": row.get("kd"),
            "kast": row.get("kast"),
            "adr": row.get("adr"),
            "hs_pct": row.get("hs_pct"),
            "rounds": row.get("rounds"),
        })

    # Partial results message
    if count < limit:
        headline = f"Only {count} player{'s' if count > 1 else ''} matched these filters. Here's what was found: " + headline

    return {
        "success": True,
        "headline": headline,
        "ranked_label": ranked_label,
        "players": players,
        "metadata": metadata,
        "result_count": count,
    }
