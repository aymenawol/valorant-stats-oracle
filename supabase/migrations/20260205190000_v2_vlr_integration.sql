-- V2: VLR.gg Integration — canonicalization, rankings, aggregate stats, RPC

-- ============================================================
-- 1. Add VLR.gg identifiers for canonicalization & dedup
-- ============================================================
ALTER TABLE public.teams  ADD COLUMN IF NOT EXISTS vlr_id  TEXT UNIQUE;
ALTER TABLE public.teams  ADD COLUMN IF NOT EXISTS vlr_url TEXT;

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS vlr_id  TEXT UNIQUE;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS vlr_url TEXT;

ALTER TABLE public.events  ADD COLUMN IF NOT EXISTS vlr_id  TEXT UNIQUE;
ALTER TABLE public.events  ADD COLUMN IF NOT EXISTS vlr_url TEXT;

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS vlr_id  TEXT UNIQUE;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS vlr_url TEXT;

-- Add rating column to player_map_stats (vlr.gg rating 2.0)
ALTER TABLE public.player_map_stats ADD COLUMN IF NOT EXISTS rating NUMERIC(5,2);

-- Expand map_name constraint for newer maps
ALTER TABLE public.maps DROP CONSTRAINT IF EXISTS maps_map_name_check;
ALTER TABLE public.maps ADD CONSTRAINT maps_map_name_check
  CHECK (map_name IN (
    'Bind','Haven','Split','Ascent','Icebox','Breeze',
    'Fracture','Pearl','Lotus','Sunset','Abyss','Drift'
  ));

-- ============================================================
-- 2. Rankings table (periodic snapshots from vlrggapi /rankings)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rankings (
    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id       UUID        NOT NULL REFERENCES public.teams(id),
    region        TEXT        NOT NULL,
    rank          INTEGER     NOT NULL,
    record        TEXT,
    earnings      TEXT,
    snapshot_date DATE        NOT NULL DEFAULT CURRENT_DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(team_id, region, snapshot_date)
);

ALTER TABLE public.rankings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access for rankings"
  ON public.rankings FOR SELECT USING (true);

-- ============================================================
-- 3. Aggregate player stats (from vlrggapi /stats endpoint)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_stats_aggregate (
    id                        UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    player_id                 UUID        NOT NULL REFERENCES public.players(id),
    region                    TEXT        NOT NULL,
    timespan                  TEXT        NOT NULL,  -- '30','60','90','all'
    rating                    NUMERIC(5,2),
    average_combat_score      NUMERIC(6,2),
    kill_deaths               NUMERIC(5,2),
    kast                      NUMERIC(5,2),
    average_damage_per_round  NUMERIC(6,2),
    kills_per_round           NUMERIC(5,3),
    assists_per_round         NUMERIC(5,3),
    first_kills_per_round     NUMERIC(5,3),
    first_deaths_per_round    NUMERIC(5,3),
    headshot_percentage       NUMERIC(5,2),
    clutch_success_percentage NUMERIC(5,2),
    snapshot_date             DATE        NOT NULL DEFAULT CURRENT_DATE,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(player_id, region, timespan, snapshot_date)
);

ALTER TABLE public.player_stats_aggregate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access for player_stats_aggregate"
  ON public.player_stats_aggregate FOR SELECT USING (true);

-- ============================================================
-- 4. Ingestion log — track every pipeline run
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ingestion_log (
    id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    source            TEXT        NOT NULL,   -- 'vlrggapi' | 'vlr_scrape'
    endpoint          TEXT        NOT NULL,
    status            TEXT        NOT NULL,   -- 'success' | 'partial' | 'error'
    records_processed INTEGER     DEFAULT 0,
    error_message     TEXT,
    metadata          JSONB,
    started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at      TIMESTAMPTZ
);

ALTER TABLE public.ingestion_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access for ingestion_log"
  ON public.ingestion_log FOR SELECT USING (true);

-- ============================================================
-- 5. Indexes for new columns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_teams_vlr_id   ON public.teams(vlr_id);
CREATE INDEX IF NOT EXISTS idx_players_vlr_id ON public.players(vlr_id);
CREATE INDEX IF NOT EXISTS idx_events_vlr_id  ON public.events(vlr_id);
CREATE INDEX IF NOT EXISTS idx_matches_vlr_id ON public.matches(vlr_id);
CREATE INDEX IF NOT EXISTS idx_rankings_region ON public.rankings(region);
CREATE INDEX IF NOT EXISTS idx_rankings_team   ON public.rankings(team_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_agg_player ON public.player_stats_aggregate(player_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_log_source    ON public.ingestion_log(source, started_at DESC);

-- ============================================================
-- 6. search_player_stats — Parameterised RPC for structured queries
-- ============================================================
CREATE OR REPLACE FUNCTION public.search_player_stats(
    p_player_ign   TEXT    DEFAULT NULL,
    p_team_name    TEXT    DEFAULT NULL,
    p_map_name     TEXT    DEFAULT NULL,
    p_event_name   TEXT    DEFAULT NULL,
    p_event_tier   TEXT    DEFAULT NULL,
    p_stage        TEXT    DEFAULT NULL,
    p_agent_name   TEXT    DEFAULT NULL,
    p_agent_role   TEXT    DEFAULT NULL,
    p_player_role  TEXT    DEFAULT NULL,
    p_year_min     INTEGER DEFAULT NULL,
    p_year_max     INTEGER DEFAULT NULL,
    p_order_by     TEXT    DEFAULT 'acs',
    p_order_dir    TEXT    DEFAULT 'desc',
    p_limit        INTEGER DEFAULT 10,
    p_offset       INTEGER DEFAULT 0
)
RETURNS TABLE (
    stat_id              UUID,
    player_ign           TEXT,
    player_name          TEXT,
    player_role          TEXT,
    team_name            TEXT,
    team_abbreviation    TEXT,
    agent_name           TEXT,
    agent_role           TEXT,
    map_name             TEXT,
    event_name           TEXT,
    event_tier           TEXT,
    event_year           INTEGER,
    match_stage          TEXT,
    match_date           TIMESTAMPTZ,
    kills                INTEGER,
    deaths               INTEGER,
    assists              INTEGER,
    acs                  NUMERIC,
    adr                  NUMERIC,
    kast                 NUMERIC,
    rating               NUMERIC,
    first_kills          INTEGER,
    first_deaths         INTEGER,
    headshot_percentage  NUMERIC,
    clutches_won         INTEGER,
    clutches_attempted   INTEGER,
    multi_kills          INTEGER,
    rounds_played        INTEGER,
    kd_ratio             NUMERIC,
    vlr_match_url        TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        pms.id                AS stat_id,
        p.ign                 AS player_ign,
        p.name                AS player_name,
        p.role                AS player_role,
        t.name                AS team_name,
        t.abbreviation        AS team_abbreviation,
        a.name                AS agent_name,
        a.role                AS agent_role,
        mp.map_name,
        e.name                AS event_name,
        e.tier                AS event_tier,
        e.year                AS event_year,
        ma.stage              AS match_stage,
        ma.match_date,
        pms.kills,
        pms.deaths,
        pms.assists,
        pms.acs,
        pms.adr,
        pms.kast,
        pms.rating,
        pms.first_kills,
        pms.first_deaths,
        pms.headshot_percentage,
        pms.clutches_won,
        pms.clutches_attempted,
        pms.multi_kills,
        pms.rounds_played,
        CASE WHEN pms.deaths > 0
             THEN ROUND(pms.kills::NUMERIC / pms.deaths, 2)
             ELSE pms.kills::NUMERIC
        END                   AS kd_ratio,
        ma.vlr_url            AS vlr_match_url
    FROM public.player_map_stats pms
    JOIN public.players p  ON pms.player_id = p.id
    JOIN public.teams   t  ON pms.team_id   = t.id
    JOIN public.maps    mp ON pms.map_id    = mp.id
    JOIN public.matches ma ON mp.match_id   = ma.id
    LEFT JOIN public.events e ON ma.event_id = e.id
    LEFT JOIN public.agents a ON pms.agent_id = a.id
    WHERE
        (p_player_ign  IS NULL OR p.ign   ILIKE '%' || p_player_ign  || '%')
        AND (p_team_name   IS NULL OR t.name  ILIKE '%' || p_team_name   || '%')
        AND (p_map_name    IS NULL OR mp.map_name ILIKE p_map_name)
        AND (p_event_name  IS NULL OR e.name  ILIKE '%' || p_event_name  || '%')
        AND (p_event_tier  IS NULL OR e.tier  = p_event_tier)
        AND (p_stage       IS NULL OR ma.stage = p_stage)
        AND (p_agent_name  IS NULL OR a.name  ILIKE '%' || p_agent_name  || '%')
        AND (p_agent_role  IS NULL OR a.role  = p_agent_role)
        AND (p_player_role IS NULL OR p.role  = p_player_role)
        AND (p_year_min    IS NULL OR e.year >= p_year_min)
        AND (p_year_max    IS NULL OR e.year <= p_year_max)
    ORDER BY
        -- Descending sorts
        CASE WHEN p_order_by = 'acs'     AND p_order_dir = 'desc' THEN pms.acs     END DESC NULLS LAST,
        CASE WHEN p_order_by = 'kills'   AND p_order_dir = 'desc' THEN pms.kills   END DESC NULLS LAST,
        CASE WHEN p_order_by = 'deaths'  AND p_order_dir = 'desc' THEN pms.deaths  END DESC NULLS LAST,
        CASE WHEN p_order_by = 'adr'     AND p_order_dir = 'desc' THEN pms.adr     END DESC NULLS LAST,
        CASE WHEN p_order_by = 'rating'  AND p_order_dir = 'desc' THEN pms.rating  END DESC NULLS LAST,
        CASE WHEN p_order_by = 'first_kills' AND p_order_dir = 'desc' THEN pms.first_kills END DESC NULLS LAST,
        CASE WHEN p_order_by = 'headshot_percentage' AND p_order_dir = 'desc' THEN pms.headshot_percentage END DESC NULLS LAST,
        CASE WHEN p_order_by = 'kd' AND p_order_dir = 'desc' THEN
            CASE WHEN pms.deaths > 0 THEN pms.kills::NUMERIC / pms.deaths ELSE pms.kills::NUMERIC END
        END DESC NULLS LAST,
        -- Ascending sorts
        CASE WHEN p_order_by = 'acs'     AND p_order_dir = 'asc' THEN pms.acs     END ASC NULLS LAST,
        CASE WHEN p_order_by = 'kills'   AND p_order_dir = 'asc' THEN pms.kills   END ASC NULLS LAST,
        CASE WHEN p_order_by = 'deaths'  AND p_order_dir = 'asc' THEN pms.deaths  END ASC NULLS LAST,
        CASE WHEN p_order_by = 'adr'     AND p_order_dir = 'asc' THEN pms.adr     END ASC NULLS LAST,
        CASE WHEN p_order_by = 'rating'  AND p_order_dir = 'asc' THEN pms.rating  END ASC NULLS LAST,
        CASE WHEN p_order_by = 'first_kills' AND p_order_dir = 'asc' THEN pms.first_kills END ASC NULLS LAST,
        CASE WHEN p_order_by = 'headshot_percentage' AND p_order_dir = 'asc' THEN pms.headshot_percentage END ASC NULLS LAST,
        CASE WHEN p_order_by = 'kd' AND p_order_dir = 'asc' THEN
            CASE WHEN pms.deaths > 0 THEN pms.kills::NUMERIC / pms.deaths ELSE pms.kills::NUMERIC END
        END ASC NULLS LAST,
        -- Fallback sort
        pms.acs DESC NULLS LAST
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;
