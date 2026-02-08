// supabase/functions/vlr-ingest/index.ts
//
// Hybrid VLR.gg Data Ingestion Pipeline
// Prefer vlrggapi JSON → fallback to vlr.gg HTML scraping for per-map stats
//
// Usage:
//   POST { "mode": "stats",   "region": "na", "timespan": "60" }
//   POST { "mode": "matches"  }
//   POST { "mode": "events",  "status": "completed" }
//   POST { "mode": "rankings","region": "na" }
//   POST { "mode": "match-detail", "vlrId": "318931", "vlrSlug": "..." }
//   POST { "mode": "full" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Constants ──────────────────────────────────────────────────────────────

const VLR_API = "https://vlrggapi.vercel.app";
const VLR_WEB = "https://www.vlr.gg";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const REGIONS = ["na", "eu", "ap", "la", "la-s", "la-n", "oce", "kr", "mn", "gc", "br", "cn"];
const JSON_HDR = { ...CORS, "Content-Type": "application/json" };
const UA = "VCT-Stats-Oracle/1.0 (Supabase Edge Function)";

// ─── Supabase admin client (service-role for writes) ────────────────────────

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ─── Utility ────────────────────────────────────────────────────────────────

function parseNum(v: string | undefined | null): number | null {
  if (!v || v === "-") return null;
  const cleaned = v.replace(/[,%]/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function extractVlrId(matchPage: string): string | null {
  // "/318931/sentinels-vs-cloud9-..." → "318931"
  const m = matchPage.match(/^\/(\d+)\//);
  return m ? m[1] : null;
}

function parseDateRange(dates: string): { start: string | null; end: string | null; year: number | null } {
  // "Mar 25 - May 19, 2024" or "Jun 2024"
  const yearMatch = dates.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1]) : null;
  // Simple parse: take the year and try to build dates
  try {
    const parts = dates.split(" - ");
    if (parts.length === 2) {
      const endPart = parts[1].trim(); // "May 19, 2024"
      const startPart = parts[0].trim() + (endPart.includes(",") ? ", " + year : "");
      return {
        start: new Date(startPart).toISOString().split("T")[0],
        end: new Date(endPart).toISOString().split("T")[0],
        year,
      };
    }
  } catch { /* fall through */ }
  return { start: null, end: null, year };
}

function inferTier(eventName: string): string {
  const lower = eventName.toLowerCase();
  if (lower.includes("champions")) return "champions";
  if (lower.includes("masters")) return "masters";
  if (lower.includes("challengers") || lower.includes("ascension")) return "challengers";
  return "regular";
}

async function fetchJson(url: string, retries = 3): Promise<any | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) return await res.json();
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
        continue;
      }
      console.error(`[vlr-ingest] ${url} → ${res.status}`);
      return null;
    } catch (e) {
      console.error(`[vlr-ingest] fetch error ${url}:`, e);
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return null;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
        "Accept": "text/html",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    console.error(`[vlr-ingest] HTML fetch error ${url}:`, e);
    return null;
  }
}

async function logRun(
  source: string, endpoint: string, status: string, count: number,
  error?: string, meta?: Record<string, unknown>,
) {
  await sb.from("ingestion_log").insert({
    source, endpoint, status,
    records_processed: count,
    error_message: error ?? null,
    metadata: meta ?? null,
    completed_at: new Date().toISOString(),
  });
}

// ─── DB upsert helpers ──────────────────────────────────────────────────────

async function ensureTeam(
  name: string, opts?: { abbreviation?: string; region?: string; logoUrl?: string },
): Promise<string | null> {
  if (!name?.trim()) return null;
  const clean = name.trim();

  const { data: existing } = await sb
    .from("teams").select("id").ilike("name", clean).limit(1).maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await sb.from("teams").insert({
    name: clean,
    abbreviation: opts?.abbreviation ?? clean.slice(0, 4).toUpperCase(),
    region: opts?.region ?? null,
    logo_url: opts?.logoUrl ?? null,
  }).select("id").single();
  if (error) { console.error("[ensureTeam]", error.message); return null; }
  return data?.id ?? null;
}

async function ensurePlayer(
  ign: string, teamId: string | null,
): Promise<string | null> {
  if (!ign?.trim()) return null;
  const clean = ign.trim();

  const { data: existing } = await sb
    .from("players").select("id").ilike("ign", clean).limit(1).maybeSingle();
  if (existing) {
    // Update team assignment if changed
    if (teamId) await sb.from("players").update({ current_team_id: teamId }).eq("id", existing.id);
    return existing.id;
  }

  const { data, error } = await sb.from("players").insert({
    ign: clean, name: clean, current_team_id: teamId,
  }).select("id").single();
  if (error) { console.error("[ensurePlayer]", error.message); return null; }
  return data?.id ?? null;
}

async function ensureEvent(
  name: string, opts?: { region?: string; year?: number; tier?: string; startDate?: string; endDate?: string },
): Promise<string | null> {
  if (!name?.trim()) return null;
  const clean = name.trim();

  const { data: existing } = await sb
    .from("events").select("id").ilike("name", clean).limit(1).maybeSingle();
  if (existing) return existing.id;

  const tier = opts?.tier ?? inferTier(clean);
  const { data, error } = await sb.from("events").insert({
    name: clean,
    tier,
    region: opts?.region ?? null,
    year: opts?.year ?? new Date().getFullYear(),
    start_date: opts?.startDate ?? null,
    end_date: opts?.endDate ?? null,
  }).select("id").single();
  if (error) { console.error("[ensureEvent]", error.message); return null; }
  return data?.id ?? null;
}

async function ensureAgent(name: string, role?: string): Promise<string | null> {
  if (!name?.trim()) return null;
  const clean = name.trim();

  const { data: existing } = await sb
    .from("agents").select("id").ilike("name", clean).limit(1).maybeSingle();
  if (existing) return existing.id;

  const inferredRole = inferAgentRole(clean);
  const { data, error } = await sb.from("agents").insert({
    name: clean, role: role ?? inferredRole,
  }).select("id").single();
  if (error) { console.error("[ensureAgent]", error.message); return null; }
  return data?.id ?? null;
}

function inferAgentRole(agent: string): string {
  const name = agent.toLowerCase();
  const duelists = ["jett", "raze", "reyna", "phoenix", "yoru", "neon", "iso", "waylay"];
  const initiators = ["sova", "breach", "skye", "fade", "gekko", "kayo"];
  const controllers = ["brimstone", "viper", "omen", "astra", "harbor", "clove"];
  const sentinels = ["sage", "cypher", "killjoy", "chamber", "deadlock", "vyse", "tejo"];
  if (duelists.some((d) => name.includes(d))) return "duelist";
  if (initiators.some((d) => name.includes(d))) return "initiator";
  if (controllers.some((d) => name.includes(d))) return "controller";
  if (sentinels.some((d) => name.includes(d))) return "sentinel";
  return "duelist";
}

async function ensureMap(
  mapName: string, matchId: string, mapNumber: number,
  opts?: { team1Rounds?: number; team2Rounds?: number; winnerId?: string },
): Promise<string | null> {
  // Check if map already exists for this match + map_number
  const { data: existing } = await sb
    .from("maps").select("id")
    .eq("match_id", matchId).eq("map_number", mapNumber)
    .limit(1).maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await sb.from("maps").insert({
    match_id: matchId,
    map_name: mapName,
    map_number: mapNumber,
    team1_rounds: opts?.team1Rounds ?? null,
    team2_rounds: opts?.team2Rounds ?? null,
    winner_team_id: opts?.winnerId ?? null,
  }).select("id").single();
  if (error) { console.error("[ensureMap]", error.message); return null; }
  return data?.id ?? null;
}

// ─── Pipeline: Ingest aggregate player stats from vlrggapi ──────────────────

async function ingestStats(region: string = "na", timespan: string = "60"): Promise<number> {
  const url = `${VLR_API}/stats?region=${region}&timespan=${timespan}`;
  const json = await fetchJson(url);
  if (!json?.data?.segments) {
    await logRun("vlrggapi", `/stats?region=${region}`, "error", 0, "No data returned");
    return 0;
  }

  const segments: any[] = json.data.segments;
  let count = 0;

  for (const seg of segments) {
    try {
      const teamId = await ensureTeam(seg.org, { region });
      const playerId = await ensurePlayer(seg.player, teamId);
      if (!playerId) continue;

      // Upsert aggregate stats
      const row = {
        player_id: playerId,
        region,
        timespan,
        rating: parseNum(seg.rating),
        average_combat_score: parseNum(seg.average_combat_score),
        kill_deaths: parseNum(seg.kill_deaths),
        kast: parseNum(seg.kill_assists_survived_traded),
        average_damage_per_round: parseNum(seg.average_damage_per_round),
        kills_per_round: parseNum(seg.kills_per_round),
        assists_per_round: parseNum(seg.assists_per_round),
        first_kills_per_round: parseNum(seg.first_kills_per_round),
        first_deaths_per_round: parseNum(seg.first_deaths_per_round),
        headshot_percentage: parseNum(seg.headshot_percentage),
        clutch_success_percentage: parseNum(seg.clutch_success_percentage),
        snapshot_date: new Date().toISOString().split("T")[0],
      };

      const { error } = await sb.from("player_stats_aggregate").upsert(row, {
        onConflict: "player_id,region,timespan,snapshot_date",
      });
      if (error) console.error("[ingestStats] upsert error:", error.message);
      else count++;
    } catch (e) {
      console.error("[ingestStats] row error:", e);
    }
  }

  await logRun("vlrggapi", `/stats?region=${region}&timespan=${timespan}`, "success", count);
  return count;
}

// ─── Pipeline: Ingest match results from vlrggapi ───────────────────────────

async function ingestMatches(): Promise<number> {
  const url = `${VLR_API}/match?q=results`;
  const json = await fetchJson(url);
  if (!json?.data?.segments) {
    await logRun("vlrggapi", "/match?q=results", "error", 0, "No data returned");
    return 0;
  }

  const segments: any[] = json.data.segments;
  let count = 0;

  for (const seg of segments) {
    try {
      const vlrId = extractVlrId(seg.match_page || "");
      if (!vlrId) continue;

      // Check if already ingested
      const { data: existing } = await sb
        .from("matches").select("id").eq("vlr_id", vlrId).maybeSingle();
      if (existing) { count++; continue; }

      const team1Id = await ensureTeam(seg.team1);
      const team2Id = await ensureTeam(seg.team2);
      const eventId = seg.round_info ? await ensureEvent(seg.round_info) : null;

      const { error } = await sb.from("matches").insert({
        vlr_id: vlrId,
        vlr_url: seg.match_page ? `${VLR_WEB}${seg.match_page}` : null,
        team1_id: team1Id,
        team2_id: team2Id,
        team1_score: parseNum(seg.score1) ? parseInt(seg.score1) : null,
        team2_score: parseNum(seg.score2) ? parseInt(seg.score2) : null,
        event_id: eventId,
        match_date: new Date().toISOString(), // API gives relative time, approximate
      });
      if (error) console.error("[ingestMatches] insert error:", error.message);
      else count++;
    } catch (e) {
      console.error("[ingestMatches] row error:", e);
    }
  }

  await logRun("vlrggapi", "/match?q=results", "success", count);
  return count;
}

// ─── Pipeline: Ingest events from vlrggapi ──────────────────────────────────

async function ingestEvents(status: string = "completed"): Promise<number> {
  const url = `${VLR_API}/events?q=${status}`;
  const json = await fetchJson(url);
  if (!json?.data?.segments) {
    await logRun("vlrggapi", `/events?q=${status}`, "error", 0, "No data returned");
    return 0;
  }

  const segments: any[] = json.data.segments;
  let count = 0;

  for (const seg of segments) {
    try {
      const { start, end, year } = parseDateRange(seg.dates || "");
      await ensureEvent(seg.title, {
        region: seg.region,
        year: year ?? undefined,
        startDate: start ?? undefined,
        endDate: end ?? undefined,
      });
      count++;
    } catch (e) {
      console.error("[ingestEvents] row error:", e);
    }
  }

  await logRun("vlrggapi", `/events?q=${status}`, "success", count);
  return count;
}

// ─── Pipeline: Ingest rankings from vlrggapi ────────────────────────────────

async function ingestRankings(region: string = "na"): Promise<number> {
  const url = `${VLR_API}/rankings?region=${region}`;
  const json = await fetchJson(url);
  const segments: any[] = json?.data?.segments ?? json?.data;
  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    await logRun("vlrggapi", `/rankings?region=${region}`, "error", 0, "No data returned");
    return 0;
  }
  let count = 0;

  for (const seg of segments) {
    try {
      const teamId = await ensureTeam(seg.team, { logoUrl: seg.logo, region });
      if (!teamId) continue;

      const row = {
        team_id: teamId,
        region,
        rank: parseInt(seg.rank) || 0,
        record: seg.record || null,
        earnings: seg.earnings || null,
        snapshot_date: new Date().toISOString().split("T")[0],
      };

      const { error } = await sb.from("rankings").upsert(row, {
        onConflict: "team_id,region,snapshot_date",
      });
      if (error) console.error("[ingestRankings] upsert error:", error.message);
      else count++;
    } catch (e) {
      console.error("[ingestRankings] row error:", e);
    }
  }

  await logRun("vlrggapi", `/rankings?region=${region}`, "success", count);
  return count;
}

// ─── Scraper: Per-map player stats from a vlr.gg match page ─────────────────

interface ScrapedPlayerStat {
  playerIgn: string;
  agent: string;
  acs: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  kast: number | null;
  adr: number | null;
  hsPercent: number | null;
  firstKills: number | null;
  firstDeaths: number | null;
  rating: number | null;
  team: string;
}

interface ScrapedMap {
  mapName: string;
  mapNumber: number;
  team1Rounds: number | null;
  team2Rounds: number | null;
  players: ScrapedPlayerStat[];
}

function scrapeMatchPage(html: string): { maps: ScrapedMap[]; team1: string; team2: string } {
  const maps: ScrapedMap[] = [];
  let team1 = "";
  let team2 = "";

  // Extract team names from match header
  // Pattern: <div class="wf-title-med">TeamName</div> or similar in match header
  const teamMatches = html.match(/class="wf-title-med[^"]*"[^>]*>\s*([^<]+)/g);
  if (teamMatches && teamMatches.length >= 2) {
    team1 = teamMatches[0].replace(/class="wf-title-med[^"]*"[^>]*>\s*/, "").trim();
    team2 = teamMatches[1].replace(/class="wf-title-med[^"]*"[^>]*>\s*/, "").trim();
  }

  // Split HTML into per-map game sections
  // vlr.gg uses <div class="vm-stats-game" data-game-id="N">
  const gameSections = html.split(/vm-stats-game[^"]*"[^>]*data-game-id="(\d+)"/);

  // Process map navigation names for map identification
  const mapNavPattern = /vm-stats-gamesnav-item[^>]*data-game-id="(\d+)"[^>]*>([\s\S]*?)<\/div/g;
  const mapNames: Record<string, string> = {};
  let navMatch;
  while ((navMatch = mapNavPattern.exec(html)) !== null) {
    const gameId = navMatch[1];
    // Extract map name from the nav item text
    const nameClean = navMatch[2].replace(/<[^>]+>/g, "").trim();
    if (gameId !== "all" && nameClean) {
      mapNames[gameId] = nameClean;
    }
  }

  // Alternative: look for map names in the stats sections
  // Pattern: <div class="map"><span>Bind</span><span>Pick</span></div>
  const mapLabelPattern = /class="map"[^>]*>\s*<span[^>]*>([^<]+)/g;
  let mapLabelMatch;
  let mapIdx = 1;
  while ((mapLabelMatch = mapLabelPattern.exec(html)) !== null) {
    const name = mapLabelMatch[1].trim();
    if (name && !mapNames[String(mapIdx)]) {
      mapNames[String(mapIdx)] = name;
      mapIdx++;
    }
  }

  // Process each game section for player stats
  // Look for player stat table rows
  // Pattern: <td class="mod-player">...<div class="text-of">IGN</div>...</td>
  //          <td class="mod-agents"><img ... title="Agent"></td>
  //          <td class="mod-stat">...<span ...>VALUE</span>...</td> (repeated for each stat)
  const gameBlockPattern =
    /data-game-id="(\d+)"[\s\S]*?(?=data-game-id="|vm-stats-container-end|$)/g;
  let gameBlock;

  // Alternative approach: find all table bodies within stats games
  const allGameBlocks = html.match(
    /data-game-id="(\d+)"[\s\S]*?<\/table[\s\S]*?<\/table/g,
  ) || [];

  for (const block of allGameBlocks) {
    const idMatch = block.match(/data-game-id="(\d+)"/);
    if (!idMatch || idMatch[1] === "all") continue;
    const gameId = idMatch[1];
    const mapName = mapNames[gameId] || `Map ${gameId}`;

    // Extract score from the game header
    const scorePattern = /mod-t[12][^>]*>\s*(\d+)\s*</g;
    const scores: number[] = [];
    let scoreMatch;
    while ((scoreMatch = scorePattern.exec(block)) !== null) {
      scores.push(parseInt(scoreMatch[1]));
    }

    const players: ScrapedPlayerStat[] = [];
    let currentTeam = team1;

    // Find player rows
    // Each row has: player name, agent, then stat cells
    const playerRowPattern =
      /text-of[^>]*>\s*([^<]+)<[\s\S]*?mod-agents[\s\S]*?title="([^"]+)"[\s\S]*?((?:mod-stat[\s\S]*?){6,12})/g;
    let playerMatch;
    let playerIdx = 0;

    while ((playerMatch = playerRowPattern.exec(block)) !== null) {
      const ign = playerMatch[1].trim();
      const agent = playerMatch[2].trim();
      const statsBlock = playerMatch[3];

      // Extract numeric values from stat cells
      // Pattern: <span class="side mod-both">VALUE</span> or just numbers in mod-stat
      const statValues: (number | null)[] = [];
      const statPattern = /mod-stat[^>]*>[\s\S]*?(?:mod-both[^>]*>|>)\s*([\d.]+)/g;
      let statMatch;
      while ((statMatch = statPattern.exec(statsBlock)) !== null) {
        statValues.push(parseNum(statMatch[1]));
      }

      // After 5 players, switch to team2
      if (playerIdx === 5) currentTeam = team2;

      players.push({
        playerIgn: ign,
        agent,
        rating: statValues[0] ?? null,     // Rating (if present)
        acs: statValues[1] ?? statValues[0] ?? null,
        kills: statValues[2] ?? statValues[1] ?? null,
        deaths: statValues[3] ?? statValues[2] ?? null,
        assists: statValues[4] ?? statValues[3] ?? null,
        kast: statValues[5] ?? null,
        adr: statValues[6] ?? null,
        hsPercent: statValues[7] ?? null,
        firstKills: statValues[8] ?? null,
        firstDeaths: statValues[9] ?? null,
        team: currentTeam,
      });
      playerIdx++;
    }

    maps.push({
      mapName: normalizeMapName(mapName),
      mapNumber: parseInt(gameId),
      team1Rounds: scores[0] ?? null,
      team2Rounds: scores[1] ?? null,
      players,
    });
  }

  return { maps, team1, team2 };
}

function normalizeMapName(raw: string): string {
  const valid = [
    "Bind", "Haven", "Split", "Ascent", "Icebox", "Breeze",
    "Fracture", "Pearl", "Lotus", "Sunset", "Abyss", "Drift",
  ];
  const lower = raw.toLowerCase().trim();
  return valid.find((m) => m.toLowerCase() === lower) ?? "Bind";
}

async function ingestMatchDetail(vlrId: string, vlrSlug?: string): Promise<number> {
  const matchUrl = vlrSlug
    ? `${VLR_WEB}/${vlrId}/${vlrSlug}`
    : `${VLR_WEB}/${vlrId}`;

  const html = await fetchHtml(matchUrl);
  if (!html) {
    await logRun("vlr_scrape", matchUrl, "error", 0, "Failed to fetch match page");
    return 0;
  }

  const { maps: scrapedMaps, team1, team2 } = scrapeMatchPage(html);
  if (scrapedMaps.length === 0) {
    await logRun("vlr_scrape", matchUrl, "error", 0, "No map data extracted from page");
    return 0;
  }

  // Ensure match exists
  let { data: matchRow } = await sb
    .from("matches").select("id, team1_id, team2_id").eq("vlr_id", vlrId).maybeSingle();

  if (!matchRow) {
    const team1Id = await ensureTeam(team1);
    const team2Id = await ensureTeam(team2);
    const { data: newMatch, error } = await sb.from("matches").insert({
      vlr_id: vlrId,
      vlr_url: matchUrl,
      team1_id: team1Id,
      team2_id: team2Id,
      match_date: new Date().toISOString(),
    }).select("id, team1_id, team2_id").single();
    if (error || !newMatch) {
      await logRun("vlr_scrape", matchUrl, "error", 0, `Match insert failed: ${error?.message}`);
      return 0;
    }
    matchRow = newMatch;
  }

  let count = 0;

  for (const sMap of scrapedMaps) {
    const winnerId =
      (sMap.team1Rounds ?? 0) > (sMap.team2Rounds ?? 0) ? matchRow.team1_id :
      (sMap.team2Rounds ?? 0) > (sMap.team1Rounds ?? 0) ? matchRow.team2_id : null;

    const mapId = await ensureMap(sMap.mapName, matchRow.id, sMap.mapNumber, {
      team1Rounds: sMap.team1Rounds ?? undefined,
      team2Rounds: sMap.team2Rounds ?? undefined,
      winnerId: winnerId ?? undefined,
    });
    if (!mapId) continue;

    const roundsPlayed = (sMap.team1Rounds ?? 0) + (sMap.team2Rounds ?? 0);

    for (const p of sMap.players) {
      const teamId = p.team === team1 ? matchRow.team1_id : matchRow.team2_id;
      const playerId = await ensurePlayer(p.playerIgn, teamId);
      if (!playerId) continue;

      const agentId = p.agent ? await ensureAgent(p.agent) : null;

      // Check if stat row exists
      const { data: existingStat } = await sb
        .from("player_map_stats").select("id")
        .eq("map_id", mapId).eq("player_id", playerId)
        .maybeSingle();

      if (existingStat) { count++; continue; }

      const { error } = await sb.from("player_map_stats").insert({
        map_id: mapId,
        player_id: playerId,
        team_id: teamId,
        agent_id: agentId,
        kills: p.kills ? Math.round(p.kills) : null,
        deaths: p.deaths ? Math.round(p.deaths) : null,
        assists: p.assists ? Math.round(p.assists) : null,
        acs: p.acs,
        adr: p.adr,
        kast: p.kast,
        rating: p.rating,
        first_kills: p.firstKills ? Math.round(p.firstKills) : null,
        first_deaths: p.firstDeaths ? Math.round(p.firstDeaths) : null,
        headshot_percentage: p.hsPercent,
        rounds_played: roundsPlayed || null,
      });
      if (error) console.error("[ingestMatchDetail] stat insert:", error.message);
      else count++;
    }
  }

  await logRun("vlr_scrape", matchUrl, "success", count, undefined, {
    maps: scrapedMaps.length,
    players: scrapedMaps.reduce((n, m) => n + m.players.length, 0),
  });
  return count;
}

// ─── Pipeline: Full ingestion across all regions ────────────────────────────

async function ingestFull(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};

  // 1. Events
  results.events_completed = await ingestEvents("completed");
  results.events_upcoming = await ingestEvents("upcoming");

  // 2. Match results
  results.matches = await ingestMatches();

  // 3. Stats + Rankings for key regions
  const keyRegions = ["na", "eu", "ap", "br", "kr", "cn"];
  for (const region of keyRegions) {
    results[`stats_${region}`] = await ingestStats(region, "90");
    results[`rankings_${region}`] = await ingestRankings(region);
    // Rate-limit between regions
    await new Promise((r) => setTimeout(r, 500));
  }

  // 4. Scrape recent match details (from matches we just ingested)
  const { data: recentMatches } = await sb
    .from("matches")
    .select("vlr_id, vlr_url")
    .not("vlr_id", "is", null)
    .order("match_date", { ascending: false })
    .limit(10);

  let detailCount = 0;
  if (recentMatches) {
    for (const m of recentMatches) {
      if (!m.vlr_id) continue;
      const slug = m.vlr_url?.replace(`${VLR_WEB}/`, "").replace(`${m.vlr_id}/`, "") || "";
      detailCount += await ingestMatchDetail(m.vlr_id, slug);
      await new Promise((r) => setTimeout(r, 1500)); // polite delay
    }
  }
  results.match_details = detailCount;

  return results;
}

// ─── HTTP handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = req.method === "POST" ? await req.json() : {};
    const mode: string = body.mode || "full";
    const region: string = body.region || "na";
    const timespan: string = body.timespan || "60";

    let result: Record<string, unknown> = { mode };

    switch (mode) {
      case "stats":
        result.records = await ingestStats(region, timespan);
        break;

      case "matches":
        result.records = await ingestMatches();
        break;

      case "events":
        result.records = await ingestEvents(body.status || "completed");
        break;

      case "rankings":
        result.records = await ingestRankings(region);
        break;

      case "match-detail": {
        if (!body.vlrId) {
          return new Response(JSON.stringify({ error: "vlrId required" }), {
            status: 400, headers: JSON_HDR,
          });
        }
        result.records = await ingestMatchDetail(body.vlrId, body.vlrSlug);
        break;
      }

      case "batch-detail": {
        // Scrape matches that don't yet have player_map_stats (up to limit)
        const limit = body.limit || 5;
        
        // Get matches with vlr_id that haven't been scraped yet
        // (matches where no maps have player_map_stats)
        const { data: allMatches } = await sb
          .from("matches")
          .select("id, vlr_id, vlr_url")
          .not("vlr_id", "is", null)
          .limit(100);
        
        // Find matches without player stats
        const { data: scrapedMatchIds } = await sb
          .from("maps")
          .select("match_id")
          .not("match_id", "is", null);
        
        const scrapedSet = new Set((scrapedMatchIds || []).map(m => m.match_id));
        const unscraped = (allMatches || []).filter(m => !scrapedSet.has(m.id));
        
        let count = 0;
        const scraped: string[] = [];
        for (const m of unscraped.slice(0, limit)) {
          if (!m.vlr_id) continue;
          const slug = m.vlr_url?.replace(`${VLR_WEB}/`, "").replace(`${m.vlr_id}/`, "") || "";
          const records = await ingestMatchDetail(m.vlr_id, slug);
          count += records;
          scraped.push(m.vlr_id);
          // Small delay between matches
          await new Promise((r) => setTimeout(r, 500));
        }
        
        result.records = count;
        result.matches_scraped = scraped;
        result.remaining = unscraped.length - scraped.length;
        break;
      }

      case "full":
        result = { mode, ...await ingestFull() };
        break;

      default:
        return new Response(JSON.stringify({ error: `Unknown mode: ${mode}` }), {
          status: 400, headers: JSON_HDR,
        });
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: JSON_HDR,
    });
  } catch (e) {
    console.error("[vlr-ingest] Fatal:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: JSON_HDR,
    });
  }
});
