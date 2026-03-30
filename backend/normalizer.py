"""
Query Normalizer — runs BEFORE cache hashing.
Ensures semantically identical queries always produce the same cache key.
"""

import hashlib
import json
from typing import Any


def normalize(query: dict[str, Any]) -> dict[str, Any]:
    """Normalize a parsed query object for consistent cache keying."""
    normalized: dict[str, Any] = {}

    # Copy top-level scalar fields
    normalized["metric"] = str(query.get("metric", "acs")).lower()
    normalized["sort"] = str(query.get("sort", "desc")).lower()
    normalized["limit"] = int(query.get("limit", 5))

    # Normalize filters
    raw_filters = query.get("filters", {})
    filters: dict[str, Any] = {}

    for key, value in raw_filters.items():
        if value is None:
            continue
        if isinstance(value, str):
            # Coerce numeric strings to int
            try:
                filters[key] = int(value)
            except ValueError:
                filters[key] = value.lower()
        elif isinstance(value, (int, float)):
            filters[key] = int(value) if isinstance(value, float) and value == int(value) else value
        else:
            filters[key] = value

    normalized["filters"] = filters
    return normalized


def make_cache_key(normalized_query: dict[str, Any]) -> str:
    """Create a deterministic cache key from a normalized query object."""
    canonical = json.dumps(normalized_query, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()
