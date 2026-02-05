-- VALORANT Esports Stats Database Schema

-- Teams table
CREATE TABLE public.teams (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    abbreviation TEXT,
    region TEXT,
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Players table
CREATE TABLE public.players (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    ign TEXT NOT NULL,
    country TEXT,
    current_team_id UUID REFERENCES public.teams(id),
    role TEXT CHECK (role IN ('duelist', 'controller', 'initiator', 'sentinel', 'flex')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Events table (VCT, Champions, Challengers, etc.)
CREATE TABLE public.events (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    tier TEXT CHECK (tier IN ('international', 'regional', 'domestic', 'qualifier')),
    region TEXT,
    start_date DATE,
    end_date DATE,
    year INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Matches table
CREATE TABLE public.matches (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES public.events(id),
    team1_id UUID NOT NULL REFERENCES public.teams(id),
    team2_id UUID NOT NULL REFERENCES public.teams(id),
    team1_score INTEGER DEFAULT 0,
    team2_score INTEGER DEFAULT 0,
    stage TEXT CHECK (stage IN ('groups', 'playoffs', 'finals', 'bracket', 'swiss', 'grand_finals')),
    match_date TIMESTAMP WITH TIME ZONE NOT NULL,
    best_of INTEGER DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Maps table (individual map records within a match)
CREATE TABLE public.maps (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    map_name TEXT NOT NULL CHECK (map_name IN ('Bind', 'Haven', 'Split', 'Ascent', 'Icebox', 'Breeze', 'Fracture', 'Pearl', 'Lotus', 'Sunset', 'Abyss')),
    map_number INTEGER NOT NULL,
    team1_rounds INTEGER DEFAULT 0,
    team2_rounds INTEGER DEFAULT 0,
    winner_team_id UUID REFERENCES public.teams(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Agents table
CREATE TABLE public.agents (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('duelist', 'controller', 'initiator', 'sentinel')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Player Map Stats - granular per-map, per-player statistics
CREATE TABLE public.player_map_stats (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    map_id UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES public.players(id),
    team_id UUID NOT NULL REFERENCES public.teams(id),
    agent_id UUID REFERENCES public.agents(id),
    
    -- Core combat stats
    kills INTEGER NOT NULL DEFAULT 0,
    deaths INTEGER NOT NULL DEFAULT 0,
    assists INTEGER NOT NULL DEFAULT 0,
    
    -- Advanced stats
    acs NUMERIC(6,2) DEFAULT 0, -- Average Combat Score
    adr NUMERIC(6,2) DEFAULT 0, -- Average Damage per Round
    kast NUMERIC(5,2) DEFAULT 0, -- Kill/Assist/Survive/Trade percentage
    
    -- First blood stats
    first_kills INTEGER DEFAULT 0,
    first_deaths INTEGER DEFAULT 0,
    
    -- Clutch and multi-kill stats
    clutches_won INTEGER DEFAULT 0,
    clutches_attempted INTEGER DEFAULT 0,
    multi_kills INTEGER DEFAULT 0,
    
    -- Economy stats
    headshot_percentage NUMERIC(5,2) DEFAULT 0,
    
    -- Round-specific
    rounds_played INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    UNIQUE(map_id, player_id)
);

-- Create indexes for common query patterns
CREATE INDEX idx_player_map_stats_player ON public.player_map_stats(player_id);
CREATE INDEX idx_player_map_stats_map ON public.player_map_stats(map_id);
CREATE INDEX idx_player_map_stats_team ON public.player_map_stats(team_id);
CREATE INDEX idx_player_map_stats_agent ON public.player_map_stats(agent_id);
CREATE INDEX idx_player_map_stats_acs ON public.player_map_stats(acs DESC);
CREATE INDEX idx_player_map_stats_kills ON public.player_map_stats(kills DESC);
CREATE INDEX idx_maps_map_name ON public.maps(map_name);
CREATE INDEX idx_matches_date ON public.matches(match_date);
CREATE INDEX idx_matches_event ON public.matches(event_id);
CREATE INDEX idx_events_year ON public.events(year);
CREATE INDEX idx_events_tier ON public.events(tier);
CREATE INDEX idx_players_role ON public.players(role);

-- Enable RLS (public read for stats)
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_map_stats ENABLE ROW LEVEL SECURITY;

-- Public read policies (esports data is public)
CREATE POLICY "Public read access for teams" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Public read access for players" ON public.players FOR SELECT USING (true);
CREATE POLICY "Public read access for events" ON public.events FOR SELECT USING (true);
CREATE POLICY "Public read access for matches" ON public.matches FOR SELECT USING (true);
CREATE POLICY "Public read access for maps" ON public.maps FOR SELECT USING (true);
CREATE POLICY "Public read access for agents" ON public.agents FOR SELECT USING (true);
CREATE POLICY "Public read access for player_map_stats" ON public.player_map_stats FOR SELECT USING (true);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_teams_updated_at
    BEFORE UPDATE ON public.teams
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_players_updated_at
    BEFORE UPDATE ON public.players
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();