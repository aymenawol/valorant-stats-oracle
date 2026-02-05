const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a VALORANT esports statistics query translator. Convert natural language questions into a JSON filter object.

AVAILABLE FILTERS:
- player_ign: string (e.g., "TenZ", "aspas")
- team_name: string (e.g., "Sentinels", "LOUD")  
- map_name: string (Bind, Haven, Split, Ascent, Icebox, Breeze, Fracture, Pearl, Lotus, Sunset, Abyss)
- event_name: string (e.g., "Champions", "Masters")
- event_tier: string (international, regional, domestic)
- stage: string (groups, playoffs, finals, grand_finals)
- player_role: string (duelist, controller, initiator, sentinel)
- agent_role: string (duelist, controller, initiator, sentinel)
- year_min: number
- order_by: string (acs, kills, deaths, kd, adr, first_kills)
- order_dir: string (desc, asc)
- limit: number (default 5)

EXAMPLES:
Q: "highest ACS on Bind in VCT internationals since 2022"
{"map_name": "Bind", "event_tier": "international", "year_min": 2022, "order_by": "acs", "order_dir": "desc", "limit": 1}

Q: "most kills in a single map at Champions"
{"event_name": "Champions", "order_by": "kills", "order_dir": "desc", "limit": 1}

Q: "best K/D on Haven by duelists in playoffs"
{"map_name": "Haven", "player_role": "duelist", "stage": "playoffs", "order_by": "kd", "order_dir": "desc", "limit": 1}

Q: "TenZ stats on Bind"
{"player_ign": "TenZ", "map_name": "Bind", "order_by": "acs", "order_dir": "desc", "limit": 5}

IMPORTANT: Return ONLY valid JSON, no explanations.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();

    if (!query || typeof query !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing query:", query);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert NL to filters using LLM
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: query },
        ],
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Rate limit exceeded" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    let filterJson = aiData.choices?.[0]?.message?.content?.trim() || "{}";
    filterJson = filterJson.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
    
    console.log("Generated filters:", filterJson);

    let filters;
    try {
      filters = JSON.parse(filterJson);
    } catch {
      filters = { order_by: "acs", order_dir: "desc", limit: 5 };
    }

    // Build and execute query using Supabase REST API
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Construct the query URL
    let queryUrl = `${supabaseUrl}/rest/v1/player_map_stats?select=id,kills,deaths,assists,acs,adr,kast,first_kills,headshot_percentage,rounds_played,players!inner(ign,role,name),teams!inner(name,abbreviation),maps!inner(map_name,matches!inner(match_date,stage,events!inner(name,tier,year))),agents(name,role)`;

    // Add filters
    const queryParams: string[] = [];
    
    if (filters.map_name) {
      queryParams.push(`maps.map_name=eq.${encodeURIComponent(filters.map_name)}`);
    }
    if (filters.player_ign) {
      queryParams.push(`players.ign=ilike.*${encodeURIComponent(filters.player_ign)}*`);
    }
    if (filters.team_name) {
      queryParams.push(`teams.name=ilike.*${encodeURIComponent(filters.team_name)}*`);
    }
    if (filters.event_name) {
      queryParams.push(`maps.matches.events.name=ilike.*${encodeURIComponent(filters.event_name)}*`);
    }
    if (filters.event_tier) {
      queryParams.push(`maps.matches.events.tier=eq.${encodeURIComponent(filters.event_tier)}`);
    }
    if (filters.stage) {
      queryParams.push(`maps.matches.stage=eq.${encodeURIComponent(filters.stage)}`);
    }
    if (filters.player_role) {
      queryParams.push(`players.role=eq.${encodeURIComponent(filters.player_role)}`);
    }
    if (filters.year_min) {
      queryParams.push(`maps.matches.events.year=gte.${filters.year_min}`);
    }

    // Order and limit
    const orderBy = filters.order_by || "acs";
    const orderDir = filters.order_dir === "asc" ? "asc" : "desc";
    const limit = Math.min(filters.limit || 5, 10);

    if (queryParams.length > 0) {
      queryUrl += "&" + queryParams.join("&");
    }
    queryUrl += `&order=${orderBy}.${orderDir}&limit=${limit}`;

    console.log("Query URL:", queryUrl);

    const dbResponse = await fetch(queryUrl, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!dbResponse.ok) {
      console.error("DB error:", await dbResponse.text());
      return new Response(
        JSON.stringify({ success: false, error: "Database query failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawResults = await dbResponse.json();
    console.log("Raw results count:", rawResults.length);

    // Transform results
    const results = rawResults.map((r: any) => ({
      ign: r.players?.ign,
      player: r.players?.name,
      team: r.teams?.name,
      kills: r.kills,
      deaths: r.deaths,
      assists: r.assists,
      acs: Number(r.acs),
      adr: Number(r.adr),
      kast: Number(r.kast),
      first_kills: r.first_kills,
      headshot_percentage: Number(r.headshot_percentage),
      kd_ratio: r.deaths > 0 ? (r.kills / r.deaths) : r.kills,
      map_name: r.maps?.map_name,
      event: r.maps?.matches?.events?.name,
      match_date: r.maps?.matches?.match_date,
      agent: r.agents?.name,
    }));

    // Generate explanation
    let explanation = "Here are the results from the database.";
    if (results.length > 0) {
      const top = results[0];
      if (filters.order_by === "kills") {
        explanation = `${top.ign} recorded ${top.kills} kills on ${top.map_name} at ${top.event}.`;
      } else if (filters.order_by === "kd") {
        explanation = `${top.ign} achieved a ${top.kd_ratio.toFixed(2)} K/D on ${top.map_name} at ${top.event}.`;
      } else {
        explanation = `${top.ign} put up ${top.acs.toFixed(1)} ACS on ${top.map_name} at ${top.event}.`;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        query,
        filters,
        results,
        explanation,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "An error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
