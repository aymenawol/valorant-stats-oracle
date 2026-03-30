"""
ValMuse — FastAPI backend for natural language Valorant pro stats queries.
"""

import logging
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import settings
from input_validator import validate_input, ValidationError
from nlp_parser import parse
from normalizer import normalize, make_cache_key
from url_builder import build_url, InvalidParamError
from scraper import fetch_html, parse_stats_html, ScraperError
from data_normalizer import normalize_rows
from response_generator import generate_response
from cache import get_or_fetch, close_redis, get_redis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("valmuse")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("ValMuse backend starting...")
    yield
    await close_redis()
    logger.info("ValMuse backend shutdown.")


app = FastAPI(title="ValMuse API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    query: str


class ErrorResponse(BaseModel):
    success: bool = False
    error: str


# ------------- Main query endpoint -------------------------------------------

@app.post("/api/query")
async def query_stats(req: QueryRequest):
    """Main endpoint: natural language → VLR stats."""

    # 1. Input validation
    try:
        cleaned = validate_input(req.query)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=e.message)

    # 2. NLP parse
    parsed = parse(cleaned)

    # 3. Normalize (before hashing)
    normalized = normalize(parsed)

    # 4. Cache key
    cache_key = make_cache_key(normalized)

    # 5. Cache lookup + fetch with coalescing
    try:
        async def do_scrape():
            # Build URL
            url = build_url(parsed)
            logger.info("Scraping: %s", url)

            # Fetch HTML
            html = await fetch_html(url)

            # Parse HTML
            rows = parse_stats_html(html)

            # Normalize rows
            clean_rows = normalize_rows(
                rows,
                metric=parsed.get("metric", "acs"),
                limit=parsed.get("limit", 5),
            )

            # Generate response
            return generate_response(clean_rows, parsed)

        result = await get_or_fetch(cache_key, do_scrape)
        return result

    except InvalidParamError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Couldn't understand that query. {e.message}",
        )
    except ScraperError as e:
        logger.error("Scraper error: %s", e.message)
        raise HTTPException(
            status_code=503,
            detail="Stats temporarily unavailable. Try again in a few minutes.",
        )
    except TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Request timed out. VLR may be slow — try again.",
        )
    except Exception as e:
        logger.exception("Unexpected error")
        raise HTTPException(
            status_code=503,
            detail="Stats temporarily unavailable. Try again in a few minutes.",
        )


# ------------- Health check --------------------------------------------------

@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/health/scraper")
async def health_scraper():
    """
    Scraper health check — fires a known-good test query and validates results.
    Poll this with UptimeRobot / Better Uptime.
    """
    test_url = f"{settings.vlr_base_url}?timespan=60"
    try:
        html = await fetch_html(test_url)
        rows = parse_stats_html(html)
        clean = normalize_rows(rows, metric="acs", limit=20)

        if len(clean) == 0:
            raise ScraperError("Health check returned 0 rows")

        sample = clean[0]
        return {
            "status": "ok",
            "rows_returned": len(clean),
            "sample_player": sample.get("player"),
            "sample_acs": sample.get("acs"),
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.error("Health check failed: %s", e)
        raise HTTPException(
            status_code=503,
            detail={
                "status": "error",
                "message": str(e),
                "checked_at": datetime.now(timezone.utc).isoformat(),
            },
        )
