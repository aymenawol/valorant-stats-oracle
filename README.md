# VCT Stats Oracle

AI-powered natural language search for VALORANT esports statistics, sourced from [vlr.gg](https://www.vlr.gg).

## Architecture

```
User ──▶ React Frontend ──▶ Supabase Edge Function (valorant-query)
                                │
                                ├─ LLM: NL → structured filters
                                ├─ PostgreSQL: search_player_stats RPC
                                └─ LLM: RAG explanation generation

vlr-ingest Edge Function
    ├─ vlrggapi (JSON) ─▶ teams, players, events, matches, rankings, aggregate stats
    └─ vlr.gg scraper ──▶ per-map, per-player stats (player_map_stats)
```

### Data Pipeline

- **vlrggapi** (`https://vlrggapi.vercel.app/api/v1/`) — structured JSON for stats, match results, events, rankings
- **vlr.gg scraper** — HTML parsing of match detail pages for per-map player performance
- **Hybrid approach**: API preferred; scraping fallback for granular per-map stats

### Query Flow

1. User types a natural language question
2. LLM translates to structured filter parameters (never raw SQL)
3. `search_player_stats` PostgreSQL RPC executes the parameterised query
4. LLM generates a contextual explanation using only the returned data (RAG)
5. Frontend renders stat cards with full details

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Supabase Edge Functions (Deno) |
| Database | PostgreSQL (Supabase) |
| AI | Google Gemini 3 Flash via Lovable AI Gateway |
| Data Source | vlr.gg + vlrggapi |

## Database Schema

**Core tables**: `teams`, `players`, `events`, `matches`, `maps`, `agents`, `player_map_stats`

**V2 additions**: `rankings`, `player_stats_aggregate`, `ingestion_log`

**Key RPC**: `search_player_stats(p_player_ign, p_team_name, p_map_name, ...)`

All tables have Row Level Security with public read access.

## Edge Functions

### `valorant-query`
Handles natural language stat queries. POST `{ "query": "highest ACS on Bind", "offset": 0 }`.

### `vlr-ingest`
Data ingestion pipeline. POST with mode:
- `{ "mode": "full" }` — complete ingestion across all regions
- `{ "mode": "stats", "region": "na", "timespan": "60" }` — player aggregate stats
- `{ "mode": "matches" }` — recent match results
- `{ "mode": "events", "status": "completed" }` — event listings
- `{ "mode": "rankings", "region": "na" }` — team rankings
- `{ "mode": "match-detail", "vlrId": "318931" }` — scrape one match page

## Development

```bash
# Install dependencies
bun install

# Start dev server (port 8080)
bun run dev

# Run tests
bun run test
```

### Environment Variables

**Frontend** (`.env`):
```
VITE_SUPABASE_URL=https://xfhlhybxqgqbhncsdiry.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
```

**Edge Functions** (Supabase dashboard → Edge Function secrets):
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
LOVABLE_API_KEY
```

## Applying Migrations

```bash
supabase db push
# or apply manually
supabase migration up
```

## Disclaimer

This project is not affiliated with Riot Games, VALORANT, or vlr.gg. Data is sourced from publicly available information for educational purposes.
