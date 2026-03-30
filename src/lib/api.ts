const API_BASE = import.meta.env.VITE_API_URL || "";

export interface PlayerResult {
  rank: number;
  player: string;
  team: string;
  player_id: number | null;
  value: string;
  metric: string;
  acs: number | null;
  kd: number | null;
  kast: number | null;
  adr: number | null;
  hs_pct: number | null;
  rounds: number | null;
}

export interface QueryResponse {
  success: boolean;
  headline: string;
  ranked_label: string | null;
  players: PlayerResult[];
  metadata: string;
  result_count: number;
}

export interface ApiError {
  detail: string;
}

export async function queryStats(query: string): Promise<QueryResponse> {
  const resp = await fetch(`${API_BASE}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!resp.ok) {
    const err: ApiError = await resp.json().catch(() => ({
      detail: "Something went wrong. Try again.",
    }));
    throw new Error(err.detail);
  }

  return resp.json();
}

export function getAvatarUrl(playerId: number): string {
  return `${API_BASE}/api/player/${playerId}/avatar`;
}

export async function fetchAvatarUrl(playerId: number): Promise<string | null> {
  try {
    const resp = await fetch(`${API_BASE}/api/player/${playerId}/avatar`);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.avatar_url ?? null;
  } catch {
    return null;
  }
}
