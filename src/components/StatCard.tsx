import { cn } from "@/lib/utils";
import { Trophy, Target, Crosshair, Skull, Award } from "lucide-react";

interface StatCardProps {
  result: {
    player?: string;
    ign?: string;
    team?: string;
    kills?: number;
    deaths?: number;
    assists?: number;
    acs?: number;
    adr?: number;
    kast?: number;
    kd_ratio?: number;
    map_name?: string;
    event?: string;
    match_date?: string;
    first_kills?: number;
    headshot_percentage?: number;
  };
  explanation?: string;
  rank?: number;
}

export const StatCard = ({ result, explanation, rank = 1 }: StatCardProps) => {
  const playerName = result.ign || result.player || "Unknown Player";
  const teamName = result.team || "Unknown Team";
  
  // Determine the primary stat to highlight
  const primaryStat = result.acs || result.kills || result.kd_ratio;
  const primaryLabel = result.acs ? "ACS" : result.kd_ratio ? "K/D" : "Kills";
  
  const getRankIcon = () => {
    if (rank === 1) return <Trophy className="w-6 h-6 text-[hsl(var(--stat-gold))]" />;
    if (rank === 2) return <Award className="w-6 h-6 text-[hsl(var(--stat-silver))]" />;
    if (rank === 3) return <Award className="w-6 h-6 text-[hsl(var(--stat-bronze))]" />;
    return null;
  };

  return (
    <div className="animate-fade-up bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header with rank */}
      <div className="bg-gradient-to-r from-primary/10 to-transparent px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getRankIcon()}
          <div>
            <h3 className="text-2xl font-bold text-foreground">{playerName}</h3>
            <p className="text-sm text-muted-foreground font-medium">{teamName}</p>
          </div>
        </div>
        {primaryStat && (
          <div className="text-right">
            <p className="text-4xl font-black text-primary">
              {typeof primaryStat === 'number' ? primaryStat.toFixed(primaryLabel === 'K/D' ? 2 : 1) : primaryStat}
            </p>
            <p className="text-sm text-muted-foreground font-semibold">{primaryLabel}</p>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {result.kills !== undefined && (
            <StatItem 
              icon={<Crosshair className="w-4 h-4" />} 
              label="Kills" 
              value={result.kills} 
            />
          )}
          {result.deaths !== undefined && (
            <StatItem 
              icon={<Skull className="w-4 h-4" />} 
              label="Deaths" 
              value={result.deaths} 
            />
          )}
          {result.assists !== undefined && (
            <StatItem 
              icon={<Target className="w-4 h-4" />} 
              label="Assists" 
              value={result.assists} 
            />
          )}
          {result.adr !== undefined && (
            <StatItem 
              label="ADR" 
              value={Number(result.adr).toFixed(1)} 
            />
          )}
          {result.kast !== undefined && (
            <StatItem 
              label="KAST" 
              value={`${Number(result.kast).toFixed(1)}%`} 
            />
          )}
          {result.first_kills !== undefined && (
            <StatItem 
              label="First Kills" 
              value={result.first_kills} 
            />
          )}
          {result.headshot_percentage !== undefined && (
            <StatItem 
              label="HS%" 
              value={`${Number(result.headshot_percentage).toFixed(1)}%`} 
            />
          )}
        </div>

        {/* Context */}
        <div className="flex flex-wrap gap-2 mb-4">
          {result.map_name && (
            <span className="px-3 py-1 bg-secondary text-secondary-foreground text-sm font-medium rounded-lg">
              {result.map_name}
            </span>
          )}
          {result.event && (
            <span className="px-3 py-1 bg-primary/10 text-primary text-sm font-medium rounded-lg">
              {result.event}
            </span>
          )}
          {result.match_date && (
            <span className="px-3 py-1 bg-muted text-muted-foreground text-sm rounded-lg">
              {new Date(result.match_date).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
              })}
            </span>
          )}
        </div>

        {/* Explanation */}
        {explanation && (
          <p className="text-muted-foreground text-sm leading-relaxed border-t border-border pt-4 mt-4">
            {explanation}
          </p>
        )}
      </div>
    </div>
  );
};

const StatItem = ({ 
  icon, 
  label, 
  value 
}: { 
  icon?: React.ReactNode; 
  label: string; 
  value: string | number;
}) => (
  <div className="text-center">
    <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
      {icon}
      <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
    </div>
    <p className="text-xl font-bold text-foreground">{value}</p>
  </div>
);
