"""
NLP Parser — Phase 1: regex + keyword dictionary.
Converts a validated natural language string into a structured query object.
"""

import re
from typing import Any

# ---------------------------------------------------------------------------
# Canonical lookup tables
# ---------------------------------------------------------------------------

METRIC_KEYWORDS: dict[str, str] = {
    "acs": "acs",
    "combat score": "acs",
    "kd": "kd",
    "k/d": "kd",
    "kill/death": "kd",
    "kill death": "kd",
    "kills": "kills",
    "most kills": "kills",
    "frags": "kills",
    "headshot": "hs_pct",
    "hs%": "hs_pct",
    "hs": "hs_pct",
    "headshot%": "hs_pct",
    "headshot percentage": "hs_pct",
    "kast": "kast",
}

# Trigger words that imply a ranking query (default metric = acs)
_RANKING_TRIGGERS = re.compile(
    r"\b(best|highest|top|leading|most)\b", re.IGNORECASE
)

AGENT_NAMES: dict[str, str] = {
    "jett": "Jett",
    "raze": "Raze",
    "reyna": "Reyna",
    "phoenix": "Phoenix",
    "yoru": "Yoru",
    "neon": "Neon",
    "iso": "Iso",
    "waylay": "Waylay",
    "omen": "Omen",
    "brimstone": "Brimstone",
    "viper": "Viper",
    "astra": "Astra",
    "harbor": "Harbor",
    "clove": "Clove",
    "tejo": "Tejo",
    "sova": "Sova",
    "breach": "Breach",
    "skye": "Skye",
    "kayo": "KAY/O",
    "kay/o": "KAY/O",
    "fade": "Fade",
    "gekko": "Gekko",
    "killjoy": "Killjoy",
    "cypher": "Cypher",
    "sage": "Sage",
    "chamber": "Chamber",
    "deadlock": "Deadlock",
    "vyse": "Vyse",
}

ROLE_NAMES: dict[str, str] = {
    "duelist": "duelist",
    "duelists": "duelist",
    "controller": "controller",
    "controllers": "controller",
    "initiator": "initiator",
    "initiators": "initiator",
    "sentinel": "sentinel",
    "sentinels": "sentinel",
}

MAP_NAMES: dict[str, str] = {
    "bind": "Bind",
    "haven": "Haven",
    "split": "Split",
    "ascent": "Ascent",
    "icebox": "Icebox",
    "breeze": "Breeze",
    "fracture": "Fracture",
    "pearl": "Pearl",
    "lotus": "Lotus",
    "sunset": "Sunset",
    "abyss": "Abyss",
}

REGION_ALIASES: dict[str, str] = {
    "na": "na",
    "north america": "na",
    "americas": "na",
    "emea": "eu",
    "eu": "eu",
    "europe": "eu",
    "br": "la",
    "brazil": "la",
    "latam": "la",
    "la": "la",
    "latin america": "la",
    "ap": "ap",
    "apac": "ap",
    "asia": "ap",
    "asia-pacific": "ap",
    "asia pacific": "ap",
    "mn": "mn",
    "mena": "mn",
    "middle east": "mn",
}

# Timespan patterns
_TIMESPAN_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b(?:last|past)\s*90\s*(?:days?|d)\b", re.I), "90"),
    (re.compile(r"\b90\s*d(?:ays?)?\b", re.I), "90"),
    (re.compile(r"\b(?:last|past)\s*60\s*(?:days?|d)\b", re.I), "60"),
    (re.compile(r"\b60\s*d(?:ays?)?\b", re.I), "60"),
    (re.compile(r"\b(?:last|past)\s*30\s*(?:days?|d)\b", re.I), "30"),
    (re.compile(r"\b(?:last|past)\s*month\b", re.I), "30"),
    (re.compile(r"\b30\s*d(?:ays?)?\b", re.I), "30"),
    (re.compile(r"\bthis\s*month\b", re.I), "30"),
]

# Min rounds patterns
_MIN_ROUNDS_PATTERN = re.compile(
    r"\b(?:min(?:imum)?\s*)?(\d{2,4})\s*\+?\s*rounds?\b", re.I
)

# Limit patterns
_LIMIT_PATTERN = re.compile(r"\btop\s+(\d{1,2})\b", re.I)


def _detect_metric(text: str) -> str:
    """Detect the stat metric from the query text."""
    lower = text.lower()
    # Check specific metric keywords first (longest match wins)
    for keyword in sorted(METRIC_KEYWORDS.keys(), key=len, reverse=True):
        if keyword in lower:
            return METRIC_KEYWORDS[keyword]
    # If ranking trigger words are present, default to acs
    if _RANKING_TRIGGERS.search(text):
        return "acs"
    return "acs"


def _detect_agent(text: str) -> str | None:
    lower = text.lower()
    for alias, canonical in AGENT_NAMES.items():
        if re.search(r"\b" + re.escape(alias) + r"\b", lower):
            return canonical
    return None


def _detect_role(text: str) -> str | None:
    lower = text.lower()
    for alias, canonical in ROLE_NAMES.items():
        if re.search(r"\b" + re.escape(alias) + r"\b", lower):
            return canonical
    return None


def _detect_map(text: str) -> str | None:
    lower = text.lower()
    for alias, canonical in MAP_NAMES.items():
        if re.search(r"\b" + re.escape(alias) + r"\b", lower):
            return canonical
    return None


def _detect_region(text: str) -> str | None:
    lower = text.lower()
    # Try longest aliases first to avoid partial matches
    for alias in sorted(REGION_ALIASES.keys(), key=len, reverse=True):
        if re.search(r"\b" + re.escape(alias) + r"\b", lower):
            return REGION_ALIASES[alias]
    return None


def _detect_timespan(text: str) -> str | None:
    for pattern, value in _TIMESPAN_PATTERNS:
        if pattern.search(text):
            return value
    return None


def _detect_min_rounds(text: str) -> int | None:
    m = _MIN_ROUNDS_PATTERN.search(text)
    if m:
        return int(m.group(1))
    return None


def _detect_limit(text: str) -> int:
    m = _LIMIT_PATTERN.search(text)
    if m:
        return min(int(m.group(1)), 50)  # cap at 50
    return 5


def parse(text: str) -> dict[str, Any]:
    """Parse a natural language query into a structured query object."""
    metric = _detect_metric(text)
    agent = _detect_agent(text)
    role = _detect_role(text)
    map_name = _detect_map(text)
    region = _detect_region(text)
    timespan = _detect_timespan(text)
    min_rounds = _detect_min_rounds(text)
    limit = _detect_limit(text)

    # Build filters, omitting None values
    filters: dict[str, Any] = {}
    if agent:
        filters["agent"] = agent
    if role:
        filters["role"] = role
    if map_name:
        filters["map"] = map_name
    if region:
        filters["region"] = region
    if timespan:
        filters["timespan"] = timespan
    else:
        filters["timespan"] = "60"  # default
    if min_rounds:
        filters["min_rounds"] = min_rounds
    else:
        filters["min_rounds"] = 200  # default

    return {
        "metric": metric,
        "sort": "desc",
        "limit": limit,
        "filters": filters,
    }
