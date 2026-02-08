// src/lib/vlr-api.ts
//
// Client-side API layer for VCT Stats Oracle.
// Wraps Supabase edge function calls with types, retry logic, and utilities.

import { supabase } from "@/integrations/supabase/client";

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single row from the SQL query — dynamic columns */
export type ResultRow = Record<string, unknown>;

/** Column display format as inferred by the edge function */
export type ColumnFormat = "number" | "decimal" | "percent" | "date" | "text";

/** Response from the valorant-query edge function */
export interface QueryResponse {
  success: boolean;
  query: string;
  sql: string | null;
  results: ResultRow[];
  columns: string[];
  column_formats: Record<string, ColumnFormat>;
  explanation: string;
  count: number;
  error?: string;
}

export interface IngestResponse {
  success: boolean;
  mode: string;
  records?: number;
  error?: string;
  [key: string]: unknown;
}

// ─── API functions ──────────────────────────────────────────────────────────

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

async function invokeWithRetry(
  fnName: string,
  body: Record<string, unknown>,
  retries = MAX_RETRIES,
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke(fnName, { body });

      if (error) {
        lastError = new Error(error.message || "Edge function request failed");

        // Don't retry on 4xx client errors
        if (error.message?.includes("400") || error.message?.includes("401")) {
          throw lastError;
        }

        if (attempt < retries) {
          console.warn(`[vlr-api] Attempt ${attempt + 1} failed, retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
        throw lastError;
      }

      return data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < retries) {
        console.warn(`[vlr-api] Attempt ${attempt + 1} failed:`, lastError.message);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError || new Error("Request failed after retries");
}

/**
 * Send a natural-language query to the valorant-query edge function.
 * Retries up to 2 times on network/server errors.
 */
export async function queryStats(query: string): Promise<QueryResponse> {
  const data = await invokeWithRetry("valorant-query", { query });
  return data as QueryResponse;
}

/**
 * Trigger data ingestion pipeline.
 */
export async function triggerIngest(
  mode: "full" | "stats" | "matches" | "events" | "rankings" | "match-detail",
  params?: Record<string, unknown>,
): Promise<IngestResponse> {
  const data = await invokeWithRetry("vlr-ingest", { mode, ...params }, 1);
  return data as IngestResponse;
}

// ─── Formatting utilities ───────────────────────────────────────────────────

/** Format a cell value based on column format */
export function formatCellValue(value: unknown, format: ColumnFormat): string {
  if (value == null) return "—";

  switch (format) {
    case "number":
      return Number(value).toLocaleString();
    case "decimal":
      return Number(value).toFixed(2);
    case "percent":
      return `${Number(value).toFixed(1)}%`;
    case "date": {
      const d = new Date(String(value));
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    default:
      return String(value);
  }
}

/** Make a column name human-readable */
export function formatColumnName(col: string): string {
  // Special abbreviations
  const abbrevs: Record<string, string> = {
    acs: "ACS",
    adr: "ADR",
    kast: "KAST",
    kd_ratio: "K/D",
    kd: "K/D",
    avg_acs: "Avg ACS",
    avg_adr: "Avg ADR",
    avg_kast: "Avg KAST",
    avg_rating: "Avg Rating",
    avg_hs_pct: "Avg HS%",
    avg_fk_per_map: "Avg FK/Map",
    hs_pct: "HS%",
    headshot_percentage: "HS%",
    avg_headshot_percentage: "Avg HS%",
    first_kills: "First Kills",
    first_deaths: "First Deaths",
    total_fk: "Total FK",
    total_kills: "Total Kills",
    maps_played: "Maps",
    maps_won: "Maps Won",
    times_picked: "Pick Count",
    rounds_played: "Rounds",
    match_date: "Date",
    map_name: "Map",
    player_ign: "Player",
    team_name: "Team",
    event_name: "Event",
    clutches_won: "Clutches",
    multi_kills: "Multi-kills",
  };

  if (abbrevs[col]) return abbrevs[col];

  // General: snake_case → Title Case
  return col
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Get color class for agent roles */
export function getAgentRoleColor(role: string | null): string {
  switch (role?.toLowerCase()) {
    case "duelist":     return "text-red-400";
    case "controller":  return "text-blue-400";
    case "initiator":   return "text-green-400";
    case "sentinel":    return "text-yellow-400";
    default:            return "text-gray-400";
  }
}

/** Get badge color for event tiers */
export function getTierBadgeColor(tier: string | null): string {
  switch (tier?.toLowerCase()) {
    case "champions":     return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    case "international": return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    case "masters":       return "bg-purple-500/20 text-purple-300 border-purple-500/30";
    case "regional":      return "bg-purple-500/20 text-purple-300 border-purple-500/30";
    case "challengers":   return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case "domestic":      return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    default:              return "bg-gray-500/20 text-gray-300 border-gray-500/30";
  }
}
