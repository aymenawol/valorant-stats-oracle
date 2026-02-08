// supabase/functions/valorant-query/index.ts
//
// Natural-language → SQL → execute → explain
// StatMuse-style: LLM generates SQL from schema, we run it, return results + explanation.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const JSON_HDR = { ...CORS, "Content-Type": "application/json" };
const LLM_TIMEOUT_MS = 15_000; // 15s for SQL generation

// ─── SQL Generation Prompt ──────────────────────────────────────────────────

const SQL_PROMPT = `You are a PostgreSQL query generator for a VALORANT esports statistics database.
Given a natural language question, generate a SELECT query to answer it.

=== DATABASE SCHEMA ===

teams (id uuid PK, name text UNIQUE, abbreviation text, region text, vlr_id text, vlr_url text)

players (id uuid PK, name text, ign text, country text, current_team_id uuid → teams, role text, vlr_id text, vlr_url text)
  -- role values: 'duelist', 'controller', 'initiator', 'sentinel', 'flex'

agents (id uuid PK, name text UNIQUE, role text)
  -- role values: 'duelist', 'controller', 'initiator', 'sentinel'
  -- Known agents: Jett, Raze, Phoenix, Reyna, Yoru, Neon, Iso (duelists); Omen, Brimstone, Astra, Viper, Harbor, Clove (controllers); Sova, Breach, Skye, KAY/O, Fade, Gekko (initiators); Sage, Cypher, Killjoy, Chamber, Deadlock, Vyse (sentinels)

events (id uuid PK, name text, tier text, region text, start_date date, end_date date, year int, vlr_id text)
  -- tier values: 'international', 'regional', 'domestic', 'qualifier'
  -- Event name examples: "VALORANT Champions 2023", "VCT Masters Tokyo", "VCT Americas Kickoff 2024"

matches (id uuid PK, event_id uuid → events, team1_id uuid → teams, team2_id uuid → teams, team1_score int, team2_score int, stage text, match_date timestamptz, best_of int, vlr_id text, vlr_url text)
  -- stage values: 'groups', 'playoffs', 'finals', 'bracket', 'swiss', 'grand_finals'

maps (id uuid PK, match_id uuid → matches, map_name text, map_number int, team1_rounds int, team2_rounds int, winner_team_id uuid → teams)
  -- map_name values: 'Bind','Haven','Split','Ascent','Icebox','Breeze','Fracture','Pearl','Lotus','Sunset','Abyss','Drift'

player_map_stats (id uuid PK, map_id uuid → maps, player_id uuid → players, team_id uuid → teams, agent_id uuid → agents, kills int, deaths int, assists int, acs numeric, adr numeric, kast numeric, rating numeric, first_kills int, first_deaths int, clutches_won int, clutches_attempted int, multi_kills int, headshot_percentage numeric, rounds_played int)
  -- CORE STATS TABLE. Each row = one player's performance on one map in one match.
  -- acs = Average Combat Score, adr = Average Damage per Round
  -- kast = Kill/Assist/Survive/Trade %, rating = vlr.gg rating 2.0
  -- K/D ratio = kills::numeric / NULLIF(deaths, 0)

rankings (id uuid PK, team_id uuid → teams, region text, rank int, record text, earnings text, snapshot_date date)

player_stats_aggregate (id uuid PK, player_id uuid → players, region text, timespan text, rating numeric, average_combat_score numeric, kill_deaths numeric, kast numeric, average_damage_per_round numeric, kills_per_round numeric, assists_per_round numeric, first_kills_per_round numeric, first_deaths_per_round numeric, headshot_percentage numeric, clutch_success_percentage numeric, snapshot_date date)
  -- timespan: '30', '60', '90', 'all' (days)

=== JOIN PATHS ===
player_map_stats → players (player_id)
player_map_stats → teams (team_id)
player_map_stats → agents (agent_id)
player_map_stats → maps (map_id) → matches (match_id) → events (event_id)
rankings → teams (team_id)
player_stats_aggregate → players (player_id)

=== RULES ===
1. Output ONLY the raw SQL SELECT query. No markdown, no code fences, no explanations.
2. ALWAYS include LIMIT (max 25). Default LIMIT 10 for lists, LIMIT 1 for "best/highest/worst/who".
3. Use ILIKE with % wildcards for text matching on names (players, teams, events).
4. Alias all output columns with readable snake_case names.
5. For K/D ratio: ROUND(kills::numeric / NULLIF(deaths, 0), 2).
6. For per-player aggregates (averages, totals), GROUP BY the player and compute AVG/SUM/COUNT.
7. For "best/highest X" → ORDER BY X DESC LIMIT 1. For "worst/lowest X" → ORDER BY X ASC LIMIT 1.
8. For "top N" → LIMIT N.
9. Round numeric results: ROUND(value, 1) for ACS/ADR, ROUND(value, 2) for ratios/ratings.
10. When comparing players, return stats for ALL requested players.
11. Use LEFT JOIN for agents (some stats may not have agent info).
12. Always include player ign or team name in results so the answer has context.
13. "Champions" → events.name ILIKE '%Champions%'. "Masters" → events.name ILIKE '%Masters%'.
14. When a year is mentioned, filter on events.year = <year>. "this year" = 2026.
15. For aggregate stats that need minimum sample size, use HAVING COUNT(*) >= 3.
16. When asked about a single player's stats, return individual map performances unless aggregation is clearly implied.
17. For match/series results, use matches table with team scores.
18. Region values are ALWAYS lowercase: 'na', 'eu', 'ap', 'br', 'kr', 'cn', 'la', 'la-s', 'la-n', 'oce', 'mn', 'gc'. NEVER use uppercase like 'NA'.
19. Use LOWER() when filtering region if unsure, e.g. WHERE region = 'na'.
18. Always join through the correct path: player_map_stats → maps → matches → events.

=== EXAMPLES ===

Q: "highest ACS in a single map at Champions 2023"
SELECT p.ign AS player, t.name AS team, pms.acs, mp.map_name, e.name AS event
FROM player_map_stats pms
JOIN players p ON pms.player_id = p.id
JOIN teams t ON pms.team_id = t.id
JOIN maps mp ON pms.map_id = mp.id
JOIN matches ma ON mp.match_id = ma.id
JOIN events e ON ma.event_id = e.id
WHERE e.name ILIKE '%Champions%' AND e.year = 2023
ORDER BY pms.acs DESC
LIMIT 1

Q: "average ACS by team at Champions"
SELECT t.name AS team, ROUND(AVG(pms.acs), 1) AS avg_acs, COUNT(*) AS maps_played
FROM player_map_stats pms
JOIN teams t ON pms.team_id = t.id
JOIN maps mp ON pms.map_id = mp.id
JOIN matches ma ON mp.match_id = ma.id
JOIN events e ON ma.event_id = e.id
WHERE e.name ILIKE '%Champions%'
GROUP BY t.name
ORDER BY avg_acs DESC
LIMIT 10

Q: "compare TenZ and aspas"
SELECT p.ign AS player, t.name AS team,
  COUNT(*) AS maps_played,
  ROUND(AVG(pms.rating), 2) AS avg_rating,
  ROUND(AVG(pms.acs), 1) AS avg_acs,
  ROUND(AVG(pms.adr), 1) AS avg_adr,
  ROUND(SUM(pms.kills)::numeric / NULLIF(SUM(pms.deaths), 0), 2) AS kd_ratio,
  ROUND(AVG(pms.kast), 1) AS avg_kast
FROM player_map_stats pms
JOIN players p ON pms.player_id = p.id
JOIN teams t ON pms.team_id = t.id
WHERE p.ign ILIKE '%TenZ%' OR p.ign ILIKE '%aspas%'
GROUP BY p.ign, t.name
ORDER BY avg_rating DESC
LIMIT 10

Q: "top 5 duelists by K/D in 2024"
SELECT p.ign AS player, t.name AS team,
  ROUND(SUM(pms.kills)::numeric / NULLIF(SUM(pms.deaths), 0), 2) AS kd_ratio,
  SUM(pms.kills) AS total_kills,
  COUNT(*) AS maps_played
FROM player_map_stats pms
JOIN players p ON pms.player_id = p.id
JOIN teams t ON pms.team_id = t.id
JOIN maps mp ON pms.map_id = mp.id
JOIN matches ma ON mp.match_id = ma.id
JOIN events e ON ma.event_id = e.id
WHERE p.role = 'duelist' AND e.year = 2024
GROUP BY p.ign, t.name
HAVING COUNT(*) >= 5
ORDER BY kd_ratio DESC
LIMIT 5

Q: "Sentinels players stats on Lotus"
SELECT p.ign AS player, a.name AS agent, pms.kills, pms.deaths, pms.assists,
  pms.acs, pms.rating, mp.map_name, ma.match_date
FROM player_map_stats pms
JOIN players p ON pms.player_id = p.id
JOIN teams t ON pms.team_id = t.id
JOIN maps mp ON pms.map_id = mp.id
JOIN matches ma ON mp.match_id = ma.id
LEFT JOIN agents a ON pms.agent_id = a.id
WHERE t.name ILIKE '%Sentinels%' AND mp.map_name = 'Lotus'
ORDER BY pms.acs DESC
LIMIT 15

Q: "most picked agents on Bind"
SELECT a.name AS agent, a.role, COUNT(*) AS times_picked,
  ROUND(AVG(pms.acs), 1) AS avg_acs
FROM player_map_stats pms
JOIN agents a ON pms.agent_id = a.id
JOIN maps mp ON pms.map_id = mp.id
WHERE mp.map_name = 'Bind'
GROUP BY a.name, a.role
ORDER BY times_picked DESC
LIMIT 10

Q: "which team won the most maps at Champions 2023"
SELECT t.name AS team, COUNT(*) AS maps_won
FROM maps mp
JOIN teams t ON mp.winner_team_id = t.id
JOIN matches ma ON mp.match_id = ma.id
JOIN events e ON ma.event_id = e.id
WHERE e.name ILIKE '%Champions%' AND e.year = 2023
GROUP BY t.name
ORDER BY maps_won DESC
LIMIT 10

Q: "aspas stats at Champions 2023"
SELECT p.ign AS player, t.name AS team, a.name AS agent, mp.map_name,
  pms.kills, pms.deaths, pms.assists, pms.acs, ROUND(pms.rating, 2) AS rating,
  pms.adr, pms.first_kills, ma.match_date, e.name AS event
FROM player_map_stats pms
JOIN players p ON pms.player_id = p.id
JOIN teams t ON pms.team_id = t.id
JOIN maps mp ON pms.map_id = mp.id
JOIN matches ma ON mp.match_id = ma.id
JOIN events e ON ma.event_id = e.id
LEFT JOIN agents a ON pms.agent_id = a.id
WHERE p.ign ILIKE '%aspas%' AND e.name ILIKE '%Champions%' AND e.year = 2023
ORDER BY pms.acs DESC
LIMIT 15

Q: "best headshot percentage players with at least 10 maps"
SELECT p.ign AS player, t.name AS team,
  ROUND(AVG(pms.headshot_percentage), 1) AS avg_hs_pct,
  COUNT(*) AS maps_played
FROM player_map_stats pms
JOIN players p ON pms.player_id = p.id
JOIN teams t ON pms.team_id = t.id
GROUP BY p.ign, t.name
HAVING COUNT(*) >= 10
ORDER BY avg_hs_pct DESC
LIMIT 10

Q: "player with most first kills at Masters Tokyo"
SELECT p.ign AS player, t.name AS team,
  SUM(pms.first_kills) AS total_fk, COUNT(*) AS maps_played,
  ROUND(AVG(pms.first_kills::numeric), 1) AS avg_fk_per_map
FROM player_map_stats pms
JOIN players p ON pms.player_id = p.id
JOIN teams t ON pms.team_id = t.id
JOIN maps mp ON pms.map_id = mp.id
JOIN matches ma ON mp.match_id = ma.id
JOIN events e ON ma.event_id = e.id
WHERE e.name ILIKE '%Masters%Tokyo%'
GROUP BY p.ign, t.name
ORDER BY total_fk DESC
LIMIT 1

RETURN ONLY THE SQL QUERY.`;

// ─── Supabase client (lazy init) ────────────────────────────────────────────

let sb: ReturnType<typeof createClient>;
function getSb() {
  if (!sb) {
    sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return sb;
}

// ─── LLM caller ─────────────────────────────────────────────────────────────

async function callLLM(
  messages: { role: string; content: string }[],
  temperature = 0.05,
  maxTokens = 500,
): Promise<string | null> {
  const key = Deno.env.get("GOOGLE_API_KEY");
  if (!key) {
    console.error("[LLM] GOOGLE_API_KEY not set");
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    // Convert chat messages to Gemini format
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find((m) => m.role === "system");

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          ...(systemInstruction
            ? { systemInstruction: { parts: [{ text: systemInstruction.content }] } }
            : {}),
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
        }),
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[LLM] status", res.status, body.slice(0, 200));
      return null;
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
  } catch (e: any) {
    if (e.name === "AbortError") {
      console.error("[LLM] Timed out after", LLM_TIMEOUT_MS, "ms");
    } else {
      console.error("[LLM] Fetch error:", e.message ?? e);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── SQL Sanitization ───────────────────────────────────────────────────────

function sanitizeSQL(raw: string): string | null {
  // Strip markdown code fences and extra whitespace
  let sql = raw
    .replace(/```sql\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // If wrapped in quotes, unwrap
  if ((sql.startsWith('"') && sql.endsWith('"')) || (sql.startsWith("'") && sql.endsWith("'"))) {
    sql = sql.slice(1, -1).trim();
  }

  // Remove trailing semicolons (Postgres RPC doesn't want them in subqueries)
  sql = sql.replace(/;\s*$/, "").trim();

  // Basic safety checks
  const lower = sql.toLowerCase().replace(/\s+/g, " ");
  if (!lower.startsWith("select") && !lower.startsWith("with")) {
    console.error("[sanitize] Not a SELECT/WITH query:", sql.slice(0, 80));
    return null;
  }

  const forbidden = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|pg_sleep)\b/i;
  if (forbidden.test(sql)) {
    console.error("[sanitize] Forbidden keyword found:", sql.slice(0, 80));
    return null;
  }

  // Ensure LIMIT exists
  if (!/\blimit\s+\d/i.test(sql)) {
    sql += " LIMIT 25";
  }

  // Ensure LIMIT is not over 25
  sql = sql.replace(/\bLIMIT\s+(\d+)/gi, (_match, n) => {
    const num = parseInt(n, 10);
    return `LIMIT ${Math.min(num, 25)}`;
  });

  return sql;
}

// ─── Explanation builder ────────────────────────────────────────────────────

function buildExplanation(
  query: string,
  results: Record<string, unknown>[],
  columns: string[],
): string {
  if (!results.length) {
    return "No matching data found. The database may not have stats for that query yet, or try rephrasing.";
  }

  const count = results.length;
  const first = results[0];

  // Try to identify the "main subject" from common column names
  const nameCol = columns.find((c) =>
    ["player", "player_ign", "ign", "team", "team_name", "agent", "name"].includes(c)
  );
  const subject = nameCol ? String(first[nameCol]) : null;

  // Try to identify the "main stat" — first numeric column that isn't a count
  const statCol = columns.find((c) => {
    if (c === "maps_played" || c === "times_picked" || c === "total_kills" || c === "maps_won") return false;
    const v = first[c];
    return typeof v === "number" && !Number.isInteger(v);
  }) || columns.find((c) => {
    const v = first[c];
    return typeof v === "number" && c !== columns[0];
  });
  const statValue = statCol ? first[statCol] : null;

  // Format the stat label nicely
  const formatLabel = (col: string) =>
    col.replace(/_/g, " ").replace(/\b(avg|pct)\b/gi, (m) =>
      m.toLowerCase() === "avg" ? "average" : "percentage"
    );

  let explanation = "";

  if (count === 1 && subject && statValue != null) {
    // Single result: "TenZ recorded 285.3 ACS..."
    const statFormatted = typeof statValue === "number"
      ? Number.isInteger(statValue) ? String(statValue) : Number(statValue).toFixed(2)
      : String(statValue);
    explanation = `${subject} — ${statFormatted} ${formatLabel(statCol!)}`;

    // Add context from other columns
    const contextCols = columns.filter(
      (c) => c !== nameCol && c !== statCol && first[c] != null
    );
    const contextParts: string[] = [];
    for (const c of contextCols.slice(0, 3)) {
      const v = first[c];
      if (typeof v === "string" && v.length < 50) {
        contextParts.push(`${formatLabel(c)}: ${v}`);
      } else if (typeof v === "number") {
        contextParts.push(
          `${formatLabel(c)}: ${Number.isInteger(v) ? v : Number(v).toFixed(1)}`
        );
      }
    }
    if (contextParts.length) {
      explanation += ` (${contextParts.join(", ")})`;
    }
  } else if (count > 1 && subject) {
    // Multiple results
    explanation = `Showing ${count} results. #1: ${subject}`;
    if (statValue != null && statCol) {
      const statFormatted = typeof statValue === "number"
        ? Number.isInteger(statValue) ? String(statValue) : Number(statValue).toFixed(2)
        : String(statValue);
      explanation += ` with ${statFormatted} ${formatLabel(statCol)}`;
    }
    explanation += ".";
  } else {
    explanation = `Found ${count} result${count !== 1 ? "s" : ""}.`;
  }

  return explanation;
}

// ─── Column metadata helper ─────────────────────────────────────────────────

function inferColumnFormat(key: string, values: unknown[]): "number" | "decimal" | "percent" | "date" | "text" {
  const lk = key.toLowerCase();
  if (lk.includes("percentage") || lk.includes("pct") || lk === "kast" || lk === "avg_kast") return "percent";
  if (lk.includes("date")) return "date";

  // Check actual values
  const sample = values.find((v) => v != null);
  if (sample == null) return "text";
  if (typeof sample === "number") {
    if (Number.isInteger(sample) && !lk.includes("ratio") && !lk.includes("rating")) return "number";
    return "decimal";
  }
  return "text";
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return respond(false, { error: "Invalid request body" }, 400);
    }

    const { query } = body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return respond(false, { error: "Query is required" }, 400);
    }

    const trimmedQuery = query.trim();
    console.log("[valorant-query] Processing:", trimmedQuery);

    // ── Step 1: NL → SQL via LLM ──

    const rawSQL = await callLLM([
      { role: "system", content: SQL_PROMPT },
      { role: "user", content: trimmedQuery },
    ]);

    if (!rawSQL) {
      console.error("[valorant-query] LLM failed to generate SQL");
      return respond(true, {
        query: trimmedQuery,
        sql: null,
        results: [],
        columns: [],
        column_formats: {},
        explanation: "Sorry, I couldn't understand that query. The AI service may be temporarily unavailable — please try again.",
        count: 0,
      });
    }

    console.log("[valorant-query] Raw LLM output:", rawSQL.slice(0, 300));

    // ── Step 2: Sanitize SQL ──

    const sql = sanitizeSQL(rawSQL);
    if (!sql) {
      console.error("[valorant-query] SQL sanitization failed");
      return respond(true, {
        query: trimmedQuery,
        sql: rawSQL,
        results: [],
        columns: [],
        column_formats: {},
        explanation: "The generated query was invalid. Try rephrasing your question.",
        count: 0,
      });
    }

    console.log("[valorant-query] Executing SQL:", sql.slice(0, 300));

    // ── Step 3: Execute via RPC ──
    // Use direct fetch to PostgREST for predictable response handling
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_readonly_query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
      body: JSON.stringify({ query_text: sql }),
    });

    if (!rpcRes.ok) {
      const errBody = await rpcRes.text().catch(() => "");
      console.error("[valorant-query] SQL execution error:", rpcRes.status, errBody.slice(0, 300));

      let friendlyError = "The query couldn't be executed.";
      const msg = errBody.toLowerCase();
      if (msg.includes("timeout")) {
        friendlyError = "The query took too long. Try a simpler question.";
      } else if (msg.includes("does not exist")) {
        friendlyError = "The query referenced data that doesn't exist. Try rephrasing.";
      } else if (msg.includes("disallowed")) {
        friendlyError = "That query type isn't supported for safety reasons.";
      }

      return respond(true, {
        query: trimmedQuery,
        sql,
        results: [],
        columns: [],
        column_formats: {},
        explanation: friendlyError,
        count: 0,
        error: errBody.slice(0, 200),
      });
    }

    const rpcData = await rpcRes.json();
    console.log("[valorant-query] RPC response type:", typeof rpcData, "isArray:", Array.isArray(rpcData));

    // Parse: PostgREST returns the jsonb directly (an array of row objects)
    let results: Record<string, unknown>[] = [];
    if (Array.isArray(rpcData)) {
      results = rpcData;
    } else if (typeof rpcData === "string") {
      try { results = JSON.parse(rpcData); } catch { results = []; }
    } else if (rpcData && typeof rpcData === "object") {
      // Might be a single jsonb value wrapped
      results = Array.isArray(rpcData) ? rpcData : [rpcData];
    }
    console.log("[valorant-query] Results:", results.length, "rows");

    // ── Step 4: Extract columns & formats ──

    const columns = results.length > 0 ? Object.keys(results[0]) : [];
    const columnFormats: Record<string, string> = {};
    for (const col of columns) {
      const values = results.map((r) => r[col]);
      columnFormats[col] = inferColumnFormat(col, values);
    }

    // ── Step 5: Build explanation ──

    const explanation = buildExplanation(trimmedQuery, results, columns);

    // ── Step 6: Return ──

    return respond(true, {
      query: trimmedQuery,
      sql,
      results,
      columns,
      column_formats: columnFormats,
      explanation,
      count: results.length,
    });
  } catch (error: any) {
    console.error("[valorant-query] Fatal:", error?.message ?? error);
    return respond(true, {
      query: "",
      sql: null,
      results: [],
      columns: [],
      column_formats: {},
      explanation: "Something went wrong processing your query. Please try again.",
      count: 0,
      error: error?.message,
    });
  }
});

function respond(success: boolean, data: Record<string, unknown>, status = 200): Response {
  return new Response(
    JSON.stringify({ success, ...data }),
    { status, headers: JSON_HDR },
  );
}
