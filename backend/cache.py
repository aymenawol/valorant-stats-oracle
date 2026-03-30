"""
Cache Layer — Redis-backed with request coalescing to prevent thundering herd.
"""

import asyncio
import json
import logging
from typing import Any, Callable, Awaitable

import redis.asyncio as aioredis

from config import settings

logger = logging.getLogger("valmuse.cache")

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """Get or create Redis connection."""
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
        )
    return _redis


async def close_redis():
    global _redis
    if _redis is not None:
        await _redis.close()
        _redis = None


async def get_or_fetch(
    cache_key: str,
    fetch_fn: Callable[[], Awaitable[Any]],
    ttl: int | None = None,
) -> Any:
    """
    Get cached result or fetch with request coalescing.
    Only one scrape fires for concurrent identical requests.
    """
    r = await get_redis()
    effective_ttl = ttl if ttl is not None else settings.cache_ttl

    # Check cache first
    cached = await r.get(cache_key)
    if cached:
        logger.info("Cache HIT for %s", cache_key[:16])
        return json.loads(cached)

    # Try to acquire lock
    lock_key = f"lock:{cache_key}"
    acquired = await r.set(lock_key, "1", nx=True, ex=settings.lock_ttl)

    if acquired:
        try:
            result = await fetch_fn()
            await r.setex(cache_key, effective_ttl, json.dumps(result))
            return result
        finally:
            await r.delete(lock_key)
    else:
        # Another worker is fetching — poll until ready
        for _ in range(20):
            await asyncio.sleep(0.5)
            cached = await r.get(cache_key)
            if cached:
                return json.loads(cached)
        raise TimeoutError("Cache population timed out")
