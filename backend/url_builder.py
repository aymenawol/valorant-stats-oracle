"""
VLR URL Builder — constructs verified vlr.gg/stats URLs from normalized query objects.
"""

from urllib.parse import urlencode
from typing import Any

from nlp_parser import AGENT_NAMES, MAP_NAMES

ALLOWED_REGIONS = {"na", "eu", "la", "ap", "mn"}
ALLOWED_TIMESPANS = {"30", "60", "90"}
ALLOWED_AGENTS = set(AGENT_NAMES.values())
ALLOWED_MAPS = set(MAP_NAMES.values())


class InvalidParamError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def build_url(query: dict[str, Any], base_url: str = "https://www.vlr.gg/stats") -> str:
    """Build a verified VLR stats URL from a normalized query object."""
    filters = query.get("filters", {})
    params: dict[str, str] = {}

    agent = filters.get("agent")
    if agent:
        # Agent names on VLR are case-sensitive in the original form
        agent_title = agent if isinstance(agent, str) and agent[0].isupper() else agent.title()
        if agent_title not in ALLOWED_AGENTS:
            raise InvalidParamError(f"Invalid agent: {agent}")
        params["agent"] = agent_title

    map_name = filters.get("map")
    if map_name:
        map_title = map_name if isinstance(map_name, str) and map_name[0].isupper() else map_name.title()
        if map_title not in ALLOWED_MAPS:
            raise InvalidParamError(f"Invalid map: {map_name}")
        params["map"] = map_title

    region = filters.get("region")
    if region:
        region_lower = str(region).lower()
        if region_lower not in ALLOWED_REGIONS:
            raise InvalidParamError(f"Invalid region: {region}")
        params["region"] = region_lower

    timespan = filters.get("timespan")
    if timespan:
        ts = str(int(timespan)) if isinstance(timespan, (int, float)) else str(timespan)
        if ts not in ALLOWED_TIMESPANS:
            raise InvalidParamError(f"Invalid timespan: {timespan}")
        params["timespan"] = ts

    min_rounds = filters.get("min_rounds")
    if min_rounds:
        params["min_rounds"] = str(int(min_rounds))

    return f"{base_url}?{urlencode(params)}" if params else base_url
