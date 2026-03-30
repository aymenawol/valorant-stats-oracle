"""
Fetch Layer — HTTP client for VLR with retries, timeout, and rate limiting.
HTML Parser — extracts structured player stat rows from VLR /stats page.
"""

import asyncio
import time
import logging
from typing import Any

import httpx
from bs4 import BeautifulSoup

from config import settings

logger = logging.getLogger("valmuse.scraper")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}

# Simple rate limiter state
_last_request_time: float = 0.0
_rate_lock = asyncio.Lock()


class ScraperError(Exception):
    """Raised when the scraper detects broken or empty data."""

    def __init__(self, message: str, raw_html: str | None = None):
        self.message = message
        self.raw_html = raw_html
        super().__init__(message)


async def _enforce_rate_limit():
    """Ensure at most 1 request per second to VLR."""
    global _last_request_time
    async with _rate_lock:
        now = time.monotonic()
        elapsed = now - _last_request_time
        min_interval = 1.0 / settings.rate_limit_rps
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)
        _last_request_time = time.monotonic()


async def fetch_html(url: str) -> str:
    """Fetch HTML from VLR with timeout, retries, and rate limiting."""
    await _enforce_rate_limit()

    last_error: Exception | None = None
    for attempt in range(1 + settings.fetch_retries):
        try:
            async with httpx.AsyncClient(
                timeout=settings.fetch_timeout,
                follow_redirects=True,
            ) as client:
                resp = await client.get(url, headers=HEADERS)
                if 400 <= resp.status_code < 500:
                    raise ScraperError(
                        f"VLR returned {resp.status_code} for {url}"
                    )
                resp.raise_for_status()
                return resp.text
        except httpx.TimeoutException as e:
            last_error = e
            logger.warning("Timeout on attempt %d for %s", attempt + 1, url)
        except httpx.HTTPStatusError as e:
            if 400 <= e.response.status_code < 500:
                raise ScraperError(f"VLR returned {e.response.status_code}")
            last_error = e
            logger.warning(
                "HTTP %d on attempt %d for %s",
                e.response.status_code,
                attempt + 1,
                url,
            )
        except ScraperError:
            raise
        except Exception as e:
            last_error = e
            logger.warning("Error on attempt %d: %s", attempt + 1, e)

        if attempt < settings.fetch_retries:
            await asyncio.sleep(1.0)

    raise ScraperError(
        "Stats data temporarily unavailable. Try again in a moment."
    )


# -------------- HTML Parser ------------------------------------------------

# Metric column indices in VLR stats table (0-indexed from the data cells)
# VLR stats table columns: Player | Agents | Rnd | ACS | K:D | KAST | ADR | KPR | APR | FKPR | FDPR | HS% | CL%
# The first cell is player info (name + team), second is agents
# We parse by position.

METRIC_TO_SORT_PARAM: dict[str, str] = {
    "acs": "",  # default sort
    "kd": "kd",
    "kills": "kills",
    "hs_pct": "hs",
    "kast": "kast",
}


def _safe_float(val: str) -> float | None:
    try:
        return float(val.strip().replace("%", "").replace(",", ""))
    except (ValueError, AttributeError):
        return None


def _safe_int(val: str) -> int | None:
    try:
        return int(val.strip().replace(",", ""))
    except (ValueError, AttributeError):
        return None


def parse_stats_html(html: str) -> list[dict[str, Any]]:
    """Parse VLR /stats HTML into structured player stat rows."""
    soup = BeautifulSoup(html, "html.parser")

    # Find the stats table
    table = soup.select_one("table")
    if not table:
        raise ScraperError("No stats table found — VLR structure may have changed", html[:2000])

    rows = table.select("tbody tr")
    if not rows:
        raise ScraperError("Parser returned 0 rows — VLR structure may have changed", html[:2000])

    parsed: list[dict[str, Any]] = []

    for row in rows:
        cells = row.select("td")
        if len(cells) < 10:
            continue

        # First cell: player name, team, and profile link
        player_cell = cells[0]
        player_name_el = player_cell.select_one(".text-of")
        team_name_el = player_cell.select_one(".stats-player-country")

        player = player_name_el.get_text(strip=True) if player_name_el else None
        team = team_name_el.get_text(strip=True) if team_name_el else None

        # Extract player ID from profile link (e.g., /player/261/victor)
        player_id: int | None = None
        player_link = player_cell.select_one("a[href*='/player/']")
        if player_link:
            href = player_link.get("href", "")
            parts = str(href).strip("/").split("/")
            # Expected: ["player", "261", "victor"] or ["player", "261"]
            if len(parts) >= 2:
                try:
                    player_id = int(parts[1])
                except (ValueError, IndexError):
                    pass

        # If we can't find structured elements, try raw text
        if not player:
            texts = [t.strip() for t in player_cell.stripped_strings]
            player = texts[0] if texts else None
            if len(texts) > 1:
                team = texts[-1] if not team else team

        # Data cells (after player and agents columns)
        # Index: 0=Player, 1=Agents, 2=Rnd, 3=ACS, 4=K:D, 5=KAST, 6=ADR, 7=KPR, 8=APR, 9=FKPR, 10=FDPR, 11=HS%, 12=CL%
        rounds_val = _safe_int(cells[2].get_text(strip=True)) if len(cells) > 2 else None
        acs_val = _safe_float(cells[3].get_text(strip=True)) if len(cells) > 3 else None
        kd_val = _safe_float(cells[4].get_text(strip=True)) if len(cells) > 4 else None
        kast_val = _safe_float(cells[5].get_text(strip=True)) if len(cells) > 5 else None
        adr_val = _safe_float(cells[6].get_text(strip=True)) if len(cells) > 6 else None
        kpr_val = _safe_float(cells[7].get_text(strip=True)) if len(cells) > 7 else None
        hs_pct_val = _safe_float(cells[11].get_text(strip=True)) if len(cells) > 11 else None

        entry: dict[str, Any] = {
            "player": player,
            "team": team,
            "player_id": player_id,
            "rounds": rounds_val,
            "acs": acs_val,
            "kd": kd_val,
            "kast": kast_val,
            "adr": adr_val,
            "kpr": kpr_val,
            "hs_pct": hs_pct_val,
        }
        parsed.append(entry)

    # Schema validation — spot-check
    validate_parsed_rows(parsed, html[:2000])
    return parsed


def validate_parsed_rows(rows: list[dict[str, Any]], raw_html_snippet: str | None = None) -> None:
    """Validate parsed rows to catch scraper breakage early."""
    if len(rows) == 0:
        raise ScraperError(
            "Parser returned 0 rows — VLR structure may have changed",
            raw_html_snippet,
        )

    required_fields = ["player", "acs", "rounds"]
    for row in rows[:3]:
        for field in required_fields:
            if field not in row or row[field] is None:
                raise ScraperError(
                    f"Missing field '{field}' — scraper may be broken",
                    raw_html_snippet,
                )


# -------------- Player avatar ------------------------------------------------


async def fetch_player_avatar(player_id: int) -> str | None:
    """Fetch the player profile page and extract the avatar image URL.
    Returns an absolute URL or None if not found.
    """
    url = f"{settings.vlr_base_url.rstrip('/stats')}/player/{player_id}"
    try:
        html = await fetch_html(url)
    except ScraperError:
        return None

    soup = BeautifulSoup(html, "html.parser")

    # VLR player pages have the avatar in a div.player-header img or similar
    # Try several selectors for robustness
    for selector in [
        ".player-header img",
        ".wf-avatar img",
        "img.wf-avatar",
        ".player-header .wf-avatar",
    ]:
        el = soup.select_one(selector)
        if el:
            src = el.get("src")
            if src:
                src = str(src).strip()
                if src.startswith("//"):
                    return "https:" + src
                if src.startswith("/"):
                    return "https://www.vlr.gg" + src
                return src

    # Fallback: find any img inside a player-header-like container
    header = soup.select_one(".player-header")
    if header:
        img = header.find("img")
        if img:
            src = img.get("src")
            if src:
                src = str(src).strip()
                if src.startswith("//"):
                    return "https:" + src
                if src.startswith("/"):
                    return "https://www.vlr.gg" + src
                return src

    return None
