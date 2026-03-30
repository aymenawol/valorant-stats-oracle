import { AlertCircle, Trophy, Award } from "lucide-react";
import type { QueryResponse, PlayerResult } from "@/lib/api";

interface QueryResultProps {
  data: QueryResponse | null;
  error: string | null;
  isLoading: boolean;
}

export const QueryResult = ({ data, error, isLoading }: QueryResultProps) => {
  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-12">
        <div className="bg-card border border-border rounded-2xl p-8 animate-shimmer">
          <div className="flex items-center justify-center gap-3">
            <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <p className="text-center text-muted-foreground mt-4 font-medium">
            Searching VLR stats...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-12 animate-fade-up">
        <div className="bg-card border border-destructive/30 rounded-2xl p-8">
          <div className="flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {error.includes("understand") ? "Invalid Query" : "Something went wrong"}
              </h3>
              <p className="text-muted-foreground">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="w-full max-w-4xl mx-auto mt-12 space-y-6">
      {/* Headline */}
      <div className="animate-fade-up bg-gradient-to-r from-primary/5 to-transparent border border-primary/20 rounded-2xl p-6">
        <p className="text-xl font-medium text-foreground leading-relaxed">
          {data.headline}
        </p>
      </div>

      {/* Ranked list */}
      {data.players.length > 0 && (
        <div className="animate-fade-up space-y-3">
          {data.ranked_label && (
            <h2 className="text-lg font-bold text-foreground tracking-tight">
              {data.ranked_label}
            </h2>
          )}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[3rem_1fr_6rem_5rem_5rem_5rem_5rem] gap-2 px-6 py-3 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <span>#</span>
              <span>Player</span>
              <span className="text-right">{data.players[0]?.metric || "ACS"}</span>
              <span className="text-right">K/D</span>
              <span className="text-right">KAST</span>
              <span className="text-right">ADR</span>
              <span className="text-right">Rnd</span>
            </div>
            {/* Rows */}
            {data.players.map((p) => (
              <PlayerRow key={p.rank} player={p} />
            ))}
          </div>
        </div>
      )}

      {/* Filter metadata footer */}
      {data.metadata && (
        <div className="animate-fade-up text-sm text-muted-foreground bg-secondary/50 rounded-xl px-5 py-3">
          {data.metadata}
        </div>
      )}
    </div>
  );
};

function PlayerRow({ player }: { player: PlayerResult }) {
  const rankIcon = () => {
    if (player.rank === 1) return <Trophy className="w-5 h-5 text-[hsl(45,100%,60%)]" />;
    if (player.rank === 2) return <Award className="w-5 h-5 text-[hsl(220,10%,70%)]" />;
    if (player.rank === 3) return <Award className="w-5 h-5 text-[hsl(30,70%,50%)]" />;
    return <span className="text-muted-foreground font-mono">{player.rank}</span>;
  };

  return (
    <div className="grid grid-cols-[3rem_1fr_6rem_5rem_5rem_5rem_5rem] gap-2 px-6 py-4 border-b border-border/50 last:border-b-0 hover:bg-secondary/30 transition-colors">
      <div className="flex items-center justify-center">{rankIcon()}</div>
      <div className="flex flex-col justify-center min-w-0">
        <span className="font-bold text-foreground truncate">{player.player}</span>
        {player.team && (
          <span className="text-xs text-muted-foreground truncate">{player.team}</span>
        )}
      </div>
      <span className="text-right font-black text-primary self-center text-lg">{player.value}</span>
      <span className="text-right text-foreground self-center">{player.kd?.toFixed(2) ?? "—"}</span>
      <span className="text-right text-foreground self-center">{player.kast != null ? `${player.kast.toFixed(1)}%` : "—"}</span>
      <span className="text-right text-foreground self-center">{player.adr?.toFixed(1) ?? "—"}</span>
      <span className="text-right text-muted-foreground self-center">{player.rounds ?? "—"}</span>
    </div>
  );
}
